document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('searchBtn');
    const tickerInput = document.getElementById('tickerInput');
    const stockInfoDiv = document.getElementById('stockInfo');
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');
    let stockChart = null;

    const fetchStockData = async () => {
        const ticker = tickerInput.value.trim().toUpperCase();
        if (!ticker) {
            showError('Please enter a stock ticker.');
            return;
        }

        hideAll();
        loadingDiv.classList.remove('hidden');

        try {
            const response = await fetch(`/api/stock/${ticker}`);
            const data = await response.json();

            loadingDiv.classList.add('hidden');

            if (response.ok) {
                displayStockInfo(data);
            } else {
                showError(data.error || 'An unknown error occurred.');
            }
        } catch (error) {
            loadingDiv.classList.add('hidden');
            showError('Failed to fetch data. Please check your network connection.');
            console.error('Fetch error:', error);
        }
    };

    const hideAll = () => {
        stockInfoDiv.classList.add('hidden');
        errorDiv.classList.add('hidden');
    };

    const showError = (message) => {
        hideAll();
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    };

    const displayStockInfo = (data) => {
        document.getElementById('stockName').textContent = `${data.name} (${data.symbol})`;
        document.getElementById('stockSymbol').textContent = data.symbol;
        document.getElementById('currentPrice').textContent = formatCurrency(data.currentPrice);
        document.getElementById('dayHigh').textContent = formatCurrency(data.dayHigh);
        document.getElementById('dayLow').textContent = formatCurrency(data.dayLow);
        document.getElementById('fiftyTwoWeekHigh').textContent = formatCurrency(data.fiftyTwoWeekHigh);
        document.getElementById('fiftyTwoWeekLow').textContent = formatCurrency(data.fiftyTwoWeekLow);
        document.getElementById('marketCap').textContent = formatMarketCap(data.marketCap);
        
        stockInfoDiv.classList.remove('hidden');
        renderChart(data.history);
    };

    const renderChart = (history) => {
        const ctx = document.getElementById('stockChart').getContext('2d');
        
        if (stockChart) {
            stockChart.destroy();
        }

        stockChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.dates,
                datasets: [{
                    label: 'Closing Price (USD)',
                    data: history.prices,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1
                }]
            },
            options: {
                scales: {
                    y: {
                        ticks: {
                            callback: (value) => '$' + value.toFixed(2)
                        }
                    }
                }
            }
        });
    };

    const formatCurrency = (value) => {
        if (typeof value === 'number') {
            return `$${value.toFixed(2)}`;
        }
        return 'N/A';
    };

    const formatMarketCap = (value) => {
        if (typeof value !== 'number') return 'N/A';
        if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
        if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
        return `$${value}`;
    };

    searchBtn.addEventListener('click', fetchStockData);
    tickerInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            fetchStockData();
        }
    });
});