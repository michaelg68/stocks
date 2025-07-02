import sqlite3
import yfinance as yf
from flask import Flask, render_template, jsonify

DATABASE = 'portfolio.db'
app = Flask(__name__)

def get_db_connection():
    """Establishes a connection to the database."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_database():
    """Initializes the database table if it doesn't exist."""
    conn = get_db_connection()
    conn.execute('CREATE TABLE IF NOT EXISTS portfolio (ticker TEXT NOT NULL UNIQUE)')
    conn.commit()
    conn.close()

@app.route('/')
def index():
    """Renders the main page."""
    return render_template('index.html')

@app.route('/api/stock/<string:ticker>')
def get_stock_data(ticker):
    """API endpoint to fetch stock data."""
    try:
        stock = yf.Ticker(ticker)
        info = stock.info

        # Check if the ticker is valid by looking for a key that should exist
        if not info or 'shortName' not in info or info.get('shortName') is None:
            return jsonify({'error': f"Invalid ticker symbol: {ticker}"}), 404

        # Fetch historical data for the chart
        hist = stock.history(period="1y")

        data = {
            'name': info.get('shortName', 'N/A'),
            'symbol': info.get('symbol', 'N/A'),
            'currentPrice': info.get('regularMarketPrice', info.get('currentPrice', 'N/A')),
            'dayHigh': info.get('dayHigh', 'N/A'),
            'dayLow': info.get('dayLow', 'N/A'),
            'fiftyTwoWeekHigh': info.get('fiftyTwoWeekHigh', 'N/A'),
            'fiftyTwoWeekLow': info.get('fiftyTwoWeekLow', 'N/A'),
            'marketCap': info.get('marketCap', 'N/A'),
            'history': {
                'dates': hist.index.strftime('%Y-%m-%d').tolist(),
                'prices': hist['Close'].tolist()
            }
        }
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': f"An unexpected error occurred: {str(e)}"}), 500

@app.route('/api/portfolio', methods=['GET'])
def get_portfolio():
    """API endpoint to fetch all stocks in the portfolio."""
    conn = get_db_connection()
    tickers_rows = conn.execute('SELECT ticker FROM portfolio').fetchall()
    conn.close()
    
    tickers = [row['ticker'] for row in tickers_rows]
    if not tickers:
        return jsonify([])

    try:
        # Fetch all ticker data in one batch request for efficiency
        data = yf.Tickers(' '.join(tickers))
        portfolio_data = []
        for ticker in tickers:
            info = data.tickers[ticker.upper()].info
            if info.get('shortName'):
                portfolio_data.append({
                    'name': info.get('shortName'),
                    'symbol': info.get('symbol'),
                    'currentPrice': info.get('regularMarketPrice', info.get('currentPrice', 'N/A'))
                })
        return jsonify(portfolio_data)
    except Exception as e:
        return jsonify({'error': f"An error occurred while fetching portfolio data: {str(e)}"}), 500

@app.route('/api/portfolio/add/<string:ticker>', methods=['POST'])
def add_to_portfolio(ticker):
    """API endpoint to add a stock to the portfolio."""
    conn = get_db_connection()
    conn.execute('INSERT OR IGNORE INTO portfolio (ticker) VALUES (?)', (ticker.upper(),))
    conn.commit()
    conn.close()
    return jsonify({'success': f'{ticker} added to portfolio.'})

@app.route('/api/portfolio/remove/<string:ticker>', methods=['POST'])
def remove_from_portfolio(ticker):
    """API endpoint to remove a stock from the portfolio."""
    conn = get_db_connection()
    conn.execute('DELETE FROM portfolio WHERE ticker = ?', (ticker.upper(),))
    conn.commit()
    conn.close()
    return jsonify({'success': f'{ticker} removed from portfolio.'})

if __name__ == '__main__':
    init_database() # Creates the database file and table on first run
    app.run(debug=True, port=5001)