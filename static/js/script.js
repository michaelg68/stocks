document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('searchBtn');
    const tickerInput = document.getElementById('tickerInput');
    const addToPortfolioBtn = document.getElementById('addToPortfolioBtn');
    const portfolioList = document.getElementById('portfolioList');
    const portfolioLoadingDiv = document.getElementById('portfolioLoading');
    const stockInfoDiv = document.getElementById('stockInfo');
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');
    let stockChart = null;

    // --- Main Stock Search Logic ---
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
        addToPortfolioBtn.classList.add('hidden');
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
        
        // Show and configure the 'Add to Portfolio' button
        addToPortfolioBtn.dataset.ticker = data.symbol;
        addToPortfolioBtn.classList.remove('hidden');

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

    // --- Formatting Helpers ---
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

    // --- Portfolio Logic ---
    const loadPortfolio = async () => {
        portfolioLoadingDiv.classList.remove('hidden');
        portfolioList.innerHTML = ''; // Clear existing list

        try {
            const response = await fetch('/api/portfolio');
            const portfolioData = await response.json();
            portfolioLoadingDiv.classList.add('hidden');

            if (response.ok) {
                if (portfolioData.length === 0) {
                    portfolioList.innerHTML = '<li>Your portfolio is empty.</li>';
                } else {
                    portfolioData.forEach(stock => {
                        const li = document.createElement('li');
                        li.innerHTML = `
                            <div class="portfolio-item-info">
                                <span class="symbol">${stock.symbol}</span>
                                <span>(${stock.name})</span> - 
                                <strong>${formatCurrency(stock.currentPrice)}</strong>
                            </div>
                            <button class="remove-btn" data-ticker="${stock.symbol}">Remove</button>
                        `;
                        portfolioList.appendChild(li);
                    });
                }
            } else {
                portfolioList.innerHTML = '<li>Could not load portfolio.</li>';
            }
        } catch (error) {
            portfolioLoadingDiv.classList.add('hidden');
            portfolioList.innerHTML = '<li>Error loading portfolio.</li>';
            console.error('Portfolio fetch error:', error);
        }
    };

    const handleAddToPortfolio = async () => {
        const ticker = addToPortfolioBtn.dataset.ticker;
        if (!ticker) return;

        await fetch(`/api/portfolio/add/${ticker}`, { method: 'POST' });
        await loadPortfolio(); // Refresh the portfolio list
        alert(`${ticker} has been added to your portfolio!`);
    };

    const handleRemoveFromPortfolio = async (e) => {
        if (e.target.classList.contains('remove-btn')) {
            const ticker = e.target.dataset.ticker;
            if (!ticker) return;

            await fetch(`/api/portfolio/remove/${ticker}`, { method: 'POST' });
            await loadPortfolio(); // Refresh the portfolio list
        }
    };

    // --- Event Listeners ---
    searchBtn.addEventListener('click', fetchStockData);
    tickerInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            fetchStockData();
        }
    });
    addToPortfolioBtn.addEventListener('click', handleAddToPortfolio);
    portfolioList.addEventListener('click', handleRemoveFromPortfolio);

    // --- Initial Load ---
    loadPortfolio();
});