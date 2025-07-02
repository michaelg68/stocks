import yfinance as yf
from flask import Flask, render_template, jsonify

app = Flask(__name__)

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

if __name__ == '__main__':
    app.run(debug=True, port=5001)