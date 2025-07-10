import sqlite3
import yfinance as yf
from datetime import datetime, timezone
from flask import Flask, render_template, jsonify, g, request
import requests

DATABASE = 'portfolio.db'
app = Flask(__name__)

def get_db_connection():
    """
    Establishes a connection to the database, reusing it if it exists
    on the application context for the current request.
    """
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    """Closes the database connection at the end of the request."""
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_database():
    """Initializes the database table if it doesn't exist."""
    conn = get_db_connection()
    conn.execute('CREATE TABLE IF NOT EXISTS portfolio (ticker TEXT PRIMARY KEY, quantity REAL NOT NULL)')
    conn.commit()

@app.route('/')
def index():
    """Renders the main page."""
    return render_template('index.html')

@app.route('/api/stock/<string:ticker>')
def get_stock_data(ticker):
    """API endpoint to fetch stock data."""
    try:
        # Get the period from query parameters, default to '1y'
        period = request.args.get('period', '1y')

        stock = yf.Ticker(ticker)
        info = stock.info
        # Fetch historical data first, as it's a key indicator of validity for indices
        hist = stock.history(period=period)

        # --- Data Integrity and Sorting ---
        if not hist.empty:
            # 1. Sort chronologically to be certain
            hist.sort_index(ascending=True, inplace=True)
            # 2. Filter out any anomalous future dates
            today_utc = datetime.now(timezone.utc)
            hist = hist[hist.index <= today_utc]

        # A ticker is valid if it has a name in `info` OR if it has historical data.
        # This handles indices which might have sparse `info` data but valid history.
        is_valid_info = info and info.get('shortName') is not None
        is_valid_history = not hist.empty

        if not is_valid_info and not is_valid_history:
            # If we have neither info nor history, the ticker is truly invalid.
            return jsonify({'error': f"Invalid or unsupported ticker symbol: {ticker}"}), 404

        currency = info.get('currency', 'USD')
        # For Israeli stocks, yfinance returns prices in Agorot (1/100 of ILS).
        # We convert it to the main currency unit (Shekels).
        divisor = 100.0 if currency in ('ILS', 'ILA') else 1.0

        def adjust_value(value):
            """Divides value by divisor if it's a number, otherwise returns as is."""
            if isinstance(value, (int, float)):
                return value / divisor
            return value

        # For indices, the 'name' might be in 'longName' if 'shortName' is absent.
        # Also, the current price might be in the last 'Close' from history if not in info.
        name = info.get('shortName') or info.get('longName', 'N/A')
        current_price = info.get('regularMarketPrice', info.get('currentPrice'))
        if current_price is None and not hist.empty:
            # Fallback to the last closing price from the history
            current_price = hist['Close'].iloc[-1]

        data = {
            'name': name,
            'symbol': info.get('symbol', ticker.upper()), # Fallback to the requested ticker
            'currentPrice': adjust_value(current_price) if current_price is not None else 'N/A',
            'dayHigh': adjust_value(info.get('dayHigh', 'N/A')),
            'dayLow': adjust_value(info.get('dayLow', 'N/A')),
            'currency': currency,
            'fiftyTwoWeekHigh': adjust_value(info.get('fiftyTwoWeekHigh', 'N/A')),
            'fiftyTwoWeekLow': adjust_value(info.get('fiftyTwoWeekLow', 'N/A')),
            'marketCap': adjust_value(info.get('marketCap', 'N/A')),
            'history': {
                # Send data as a list of {x, y} points for time series charts
                'points': [
                    {'x': int(ts.timestamp() * 1000), 'y': price}
                    for ts, price in (hist['Close'] / divisor).items()
                ]
            }
        }
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': f"An unexpected error occurred: {str(e)}"}), 500

@app.route('/api/portfolio', methods=['GET'])
def get_portfolio():
    """API endpoint to fetch all stocks in the portfolio."""
    conn = get_db_connection()
    tickers_rows = conn.execute('SELECT ticker, quantity FROM portfolio ORDER BY ticker').fetchall()
    
    if not tickers_rows:
        return jsonify({'items': [], 'totals': {'usd': 0, 'ils': 0}})

    tickers_with_qty = {row['ticker']: row['quantity'] for row in tickers_rows}
    tickers_list = list(tickers_with_qty.keys())

    try:
        # Fetch the current USD to ILS exchange rate for conversions.
        usd_ils_rate_ticker = yf.Ticker("USDILS=X")
        usd_ils_rate_info = usd_ils_rate_ticker.info
        usd_ils_rate = usd_ils_rate_info.get('regularMarketPrice') or usd_ils_rate_info.get('currentPrice')

        if not usd_ils_rate:
            return jsonify({'error': "Could not fetch the USD/ILS exchange rate."}), 503

        # Fetch all ticker data in one batch request for efficiency
        stock_data = yf.Tickers(' '.join(tickers_list))

        portfolio_items = []
        total_value_usd = 0.0

        for ticker, quantity in tickers_with_qty.items():
            info = stock_data.tickers[ticker].info
            currency = info.get('currency', 'USD')
            price = info.get('regularMarketPrice', info.get('currentPrice'))
            
            if price is None:
                # Skip this item if price data is unavailable
                continue

            divisor = 100.0 if currency in ('ILS', 'ILA') else 1.0
            price /= divisor
            
            value_local = price * quantity

            # Aggregate total value in USD
            if currency in ('ILS', 'ILA'):
                total_value_usd += value_local / usd_ils_rate
            elif currency == 'USD':
                total_value_usd += value_local
            # Note: Stocks in other currencies are not included in the total for now.

            portfolio_items.append({
                'name': info.get('shortName', 'N/A'),
                'symbol': ticker,
                'quantity': quantity,
                'currentPrice': price,
                'currency': currency,
                'valueLocal': value_local,
            })

        total_value_ils = total_value_usd * usd_ils_rate

        return jsonify({
            'items': portfolio_items,
            'totals': {'usd': total_value_usd, 'ils': total_value_ils}
        })
    except Exception as e:
        return jsonify({'error': f"An error occurred while fetching portfolio data: {str(e)}"}), 500

@app.route('/api/portfolio/add', methods=['POST'])
def add_to_portfolio():
    """API endpoint to add or update a stock in the portfolio."""
    data = request.get_json()
    ticker = data.get('ticker')
    quantity = data.get('quantity')

    if not ticker or quantity is None or float(quantity) < 0:
        return jsonify({'error': 'Invalid ticker or quantity provided.'}), 400

    conn = get_db_connection()
    conn.execute('INSERT INTO portfolio (ticker, quantity) VALUES (?, ?) ON CONFLICT(ticker) DO UPDATE SET quantity = excluded.quantity',
                 (ticker.upper(), float(quantity)))
    conn.commit()
    return jsonify({'success': f'{ticker} updated in portfolio.'})

@app.route('/api/portfolio/remove/<string:ticker>', methods=['POST'])
def remove_from_portfolio(ticker):
    """API endpoint to remove a stock from the portfolio."""
    conn = get_db_connection()
    conn.execute('DELETE FROM portfolio WHERE ticker = ?', (ticker.upper(),))
    conn.commit()
    return jsonify({'success': f'{ticker} removed from portfolio.'})

if __name__ == '__main__':
    with app.app_context():
        init_database() # Creates the database file and table on first run
    app.run(debug=True, port=5001)