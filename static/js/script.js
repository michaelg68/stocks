document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('searchBtn');
    const tickerInput = document.getElementById('tickerInput');
    const addToPortfolioBtn = document.getElementById('addToPortfolioBtn');
    const portfolioList = document.getElementById('portfolioList');
    const portfolioTotalDiv = document.getElementById('portfolioTotal');
    const portfolioLoadingDiv = document.getElementById('portfolioLoading');
    const stockInfoDiv = document.getElementById('stockInfo');
    const rangeSelector = document.querySelector('.range-selector');
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');
    let stockChart = null;
    let currentTicker = null;

    // --- Custom Chart.js Plugin ---
    // Define the plugin once and register it globally for our chart instance.
    const verticalLinePlugin = {
        id: 'verticalLine',
        afterDraw: (chart) => {
            // We only want to draw the line when the tooltip is active
            if (chart.tooltip?._active?.length) {
                const ctx = chart.ctx;
                const x = chart.tooltip._active[0].element.x;
                const topY = chart.scales.y.top;
                const bottomY = chart.scales.y.bottom;

                // Draw the vertical line
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, topY);
                ctx.lineTo(x, bottomY);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(150, 150, 150, 0.7)';
                ctx.stroke();
                ctx.restore();
            }
        }
    };
    Chart.register(verticalLinePlugin);

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
        document.getElementById('addPortfolioForm').classList.add('hidden');
        errorDiv.classList.add('hidden');
    };

    const showError = (message) => {
        hideAll();
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    };

    const displayStockInfo = (data) => {
        currentTicker = data.symbol; // Store the current ticker for range updates

        document.getElementById('stockName').textContent = `${data.name} (${data.symbol})`;
        document.getElementById('stockSymbol').textContent = data.symbol;
        document.getElementById('currentPrice').textContent = formatCurrency(data.currentPrice, data.currency);
        document.getElementById('dayHigh').textContent = formatCurrency(data.dayHigh, data.currency);
        document.getElementById('dayLow').textContent = formatCurrency(data.dayLow, data.currency);
        document.getElementById('fiftyTwoWeekHigh').textContent = formatCurrency(data.fiftyTwoWeekHigh, data.currency);
        document.getElementById('fiftyTwoWeekLow').textContent = formatCurrency(data.fiftyTwoWeekLow, data.currency);
        document.getElementById('marketCap').textContent = formatMarketCap(data.marketCap, data.currency);
        
        // Show and configure the 'Add to Portfolio' button
        document.getElementById('addPortfolioForm').classList.remove('hidden');
        document.getElementById('addToPortfolioBtn').dataset.ticker = data.symbol;

        // Reset active range button to 1Y on new search
        document.querySelectorAll('.range-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.range-btn[data-period="1y"]').classList.add('active');

        stockInfoDiv.classList.remove('hidden');
        renderChart(data.history, data.currency);
    };

    const renderChart = (history, currency = 'USD') => {
        const ctx = document.getElementById('stockChart').getContext('2d');
        
        if (stockChart) {
            stockChart.destroy();
        }

        stockChart = new Chart(ctx, {
            type: 'line',
            data: {
                // No more 'labels', data is now self-contained
                datasets: [{
                    label: `Closing Price (${currency})`,
                    data: history.points, // Use the new {x, y} data points
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1
                }]
            },
            options: {
                layout: {
                    padding: {
                        bottom: 10 // Ensures the x-axis title has some space below it
                    }
                },
                interaction: {
                    // Show tooltip when hovering anywhere near the point, not just directly on it.
                    // This is helpful since our points have a radius of 0.
                    intersect: false,
                    mode: 'index',
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed.y;
                                // Use the existing currency formatter for a clean, consistent look
                                return `Price: ${formatCurrency(value, currency)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time', // Use the time scale
                        time: {
                            // Let Chart.js automatically determine the display unit
                            tooltipFormat: 'MMM dd, yyyy', // e.g., Jun 19, 2024
                            displayFormats: {
                                day: 'MMM dd',
                                week: 'MMM dd',
                                month: 'MMM yyyy',
                                year: 'yyyy'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    },
                    y: {
                        ticks: {
                            callback: (value) => {
                                try {
                                    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency, notation: 'compact' }).format(value);
                                } catch (e) {
                                    return `${currency} ${value.toFixed(0)}`;
                                }
                            }
                        }
                    }
                }
            }
        });
    };

    // --- Formatting Helpers ---
    const formatCurrency = (value, currency = 'USD') => {
        if (typeof value !== 'number') {
            return 'N/A';
        }
        // yfinance sometimes returns the obsolete 'ILA' code for Israeli Shekel.
        // We map it to the correct 'ILS' code for modern compatibility.
        if (currency === 'ILA') {
            currency = 'ILS';
        }
        try {
            // Use Intl.NumberFormat for robust, localized currency formatting
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency,
            }).format(value);
        } catch (e) {
            // Fallback for unrecognized currency codes
            return `${currency} ${value.toFixed(2)}`;
        }
    };

    const formatMarketCap = (value, currency = 'USD') => {
        if (typeof value !== 'number') {
            return 'N/A';
        }
        // Map old Israeli currency code to the new one
        if (currency === 'ILA') {
            currency = 'ILS';
        }

        try {
            // Use Intl.NumberFormat with compact notation for T, B, M, etc.
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency,
                notation: 'compact',
                maximumFractionDigits: 2
            }).format(value);
        } catch (e) {
            // Fallback for unrecognized currency codes or other errors
            if (value >= 1e12) return `${currency} ${(value / 1e12).toFixed(2)}T`;
            if (value >= 1e9) return `${currency} ${(value / 1e9).toFixed(2)}B`;
            if (value >= 1e6) return `${currency} ${(value / 1e6).toFixed(2)}M`;
            return `${currency} ${value}`;
        }
    };

    // --- Chart Range Update Logic ---
    const handleRangeChange = async (e) => {
        const selectedButton = e.target.closest('.range-btn');
        // Do nothing if not a button, if it's already active, or if no stock is selected
        if (!selectedButton || selectedButton.classList.contains('active') || !currentTicker) {
            return;
        }

        const period = selectedButton.dataset.period;

        // Update button styles to show which is active
        document.querySelectorAll('.range-btn').forEach(btn => btn.classList.remove('active'));
        selectedButton.classList.add('active');

        try {
            const response = await fetch(`/api/stock/${currentTicker}?period=${period}`);
            const data = await response.json();

            if (response.ok) {
                // We only need to re-render the chart with the new history
                renderChart(data.history, data.currency);
            } else {
                alert(`Could not load data for period: ${period}. Error: ${data.error}`);
            }
        } catch (error) {
            alert('Failed to update chart range. Please check your network connection.');
            console.error('Range change fetch error:', error);
        }
    };

    // --- Portfolio Logic ---
    const loadPortfolio = async () => {
        portfolioLoadingDiv.classList.remove('hidden');
        portfolioList.innerHTML = ''; // Clear existing list

        try {
            const response = await fetch('/api/portfolio');
            const data = await response.json();
            portfolioLoadingDiv.classList.add('hidden');

            if (response.ok) {
                // Display total portfolio value
                portfolioTotalDiv.innerHTML = `<h3>Total Value: ${formatCurrency(data.totalValueUsd, 'USD')}</h3>`;

                if (data.items.length === 0) {
                    portfolioList.innerHTML = '<li>Your portfolio is empty.</li>';
                } else {
                    data.items.forEach(stock => {
                        const li = document.createElement('li');
                        li.innerHTML = `
                            <div class="portfolio-item-info portfolio-item-clickable" data-ticker="${stock.symbol}">
                                <div class="portfolio-item-main">
                                    <span class="symbol">${stock.symbol}</span>
                                    <span class="name">(${stock.name})</span>
                                </div>
                                <div class="portfolio-item-details">
                                    <span>Qty: ${stock.quantity}</span>
                                    <span>Value: ${formatCurrency(stock.valueUsd, 'USD')}</span>
                                </div>
                            </div>
                            <button class="remove-btn" data-ticker="${stock.symbol}">Remove</button>
                        `;
                        portfolioList.appendChild(li);
                    });
                }
            } else {
                portfolioTotalDiv.innerHTML = '';
                portfolioList.innerHTML = '<li>Could not load portfolio.</li>';
            }
        } catch (error) {
            portfolioTotalDiv.innerHTML = '';
            portfolioLoadingDiv.classList.add('hidden');
            portfolioList.innerHTML = '<li>Error loading portfolio.</li>';
            console.error('Portfolio fetch error:', error);
        }
    };

    const handleAddToPortfolio = async () => {
        const ticker = addToPortfolioBtn.dataset.ticker;
        if (!ticker) return;
        
        const quantityInput = document.getElementById('quantityInput');
        const quantity = parseFloat(quantityInput.value);

        if (isNaN(quantity) || quantity < 0) {
            alert('Please enter a valid, non-negative quantity.');
            return;
        }

        await fetch('/api/portfolio/add', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: ticker, quantity: quantity })
        });
        await loadPortfolio(); // Refresh the portfolio list
        alert(`${ticker} has been updated in your portfolio!`);
    };

    const handlePortfolioClick = async (e) => {
        const removeBtn = e.target.closest('.remove-btn');
        const drillDownItem = e.target.closest('.portfolio-item-clickable');

        if (removeBtn) {
            // Handle removing a stock from the portfolio
            const ticker = removeBtn.dataset.ticker;
            if (!ticker) return;

            await fetch(`/api/portfolio/remove/${ticker}`, { method: 'POST' });
            await loadPortfolio(); // Refresh the portfolio list
        } else if (drillDownItem) {
            // Handle drilling down into a stock's details
            const ticker = drillDownItem.dataset.ticker;
            if (ticker) {
                tickerInput.value = ticker;
                await fetchStockData();
                // Scroll to the top of the page for a better user experience
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
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
    portfolioList.addEventListener('click', handlePortfolioClick);
    rangeSelector.addEventListener('click', handleRangeChange);

    // --- Initial Load ---
    loadPortfolio();
});