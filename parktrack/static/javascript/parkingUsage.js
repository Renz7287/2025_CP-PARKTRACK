/**
 * Parking Usage Dashboard
 * Loads real-time stats from the Django API and renders interactive charts.
 */

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function initializeParkingUsage() {
    const canvas = document.getElementById('peak-occupancy-chart');
    const tableBody = document.getElementById('vehicle-entries-body');
    const summaryContainer = document.getElementById('summary-stats');

    if (!canvas) {
        console.error('Peak occupancy chart canvas not found');
        return;
    }

    if (!window.Chart) {
        console.error('Chart.js library not found.');
        showError('Chart library failed to load. Please refresh the page.');
        return;
    }

    setLoadingState(true, tableBody);

    try {
        const response = await fetch('/parking_usage/api/stats/');
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        const data = await response.json();

        renderSummaryCards(data.summary, summaryContainer);
        renderDailyTable(data.daily_table, tableBody);
        renderDailyChart(canvas, data.daily_table, data.hourly_by_day);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showError('Failed to load parking data. Please try refreshing.', tableBody);
    } finally {
        setLoadingState(false, tableBody);
    }
}

// --- Summary Cards ---

function renderSummaryCards(summary, container) {
    if (!container || !summary) return;

    const cards = [
        {
            label: 'Total Entries This Week',
            value: summary.total_entries ?? 0,
            icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>`,
            color: 'text-green-600',
            bg: 'bg-green-50',
        },
        {
            label: 'Total Exits This Week',
            value: summary.total_exits ?? 0,
            icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>`,
            color: 'text-red-600',
            bg: 'bg-red-50',
        },
        {
            label: 'Peak Hour',
            value: summary.peak_hour ?? 'N/A',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
        },
        {
            label: 'Busiest Day',
            value: summary.peak_day ?? 'N/A',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>`,
            color: 'text-purple-600',
            bg: 'bg-purple-50',
        },
    ];

    container.innerHTML = cards.map(card => `
        <div class="flex items-center gap-4 bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4">
            <div class="${card.bg} ${card.color} p-3 rounded-lg">
                ${card.icon}
            </div>
            <div>
                <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">${card.label}</p>
                <p class="text-2xl font-bold text-gray-800">${card.value}</p>
            </div>
        </div>
    `).join('');
}

// --- Daily Bar Chart ---

function renderDailyChart(canvas, dailyTable, hourlyByDay) {
    const ChartLib = window.Chart;
    const inCounts = dailyTable.map(d => d[0]);
    const outCounts = dailyTable.map(d => d[1]);

    let hourlyChart = null;

    new ChartLib(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: DAY_ABBR,
            datasets: [
                {
                    label: 'Entries',
                    data: inCounts,
                    backgroundColor: '#991b1b',
                    borderRadius: 6,
                    hoverBackgroundColor: '#dc2626',
                },
                {
                    label: 'Exits',
                    data: outCounts,
                    backgroundColor: '#b45309',
                    borderRadius: 6,
                    hoverBackgroundColor: '#d97706',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { usePointStyle: true, pointStyleWidth: 10 },
                },
                tooltip: {
                    callbacks: {
                        footer: () => 'Click to view hourly breakdown',
                    },
                },
            },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const dayIndex = activeElements[0].index;
                    hourlyChart = showHourlyChart(dayIndex, hourlyByDay[dayIndex] || new Array(24).fill(0), hourlyChart);
                }
            },
        },
    });
}

// --- Hourly Line Chart ---

function showHourlyChart(dayIndex, hourlyCounts, existingChart) {
    const hourlySection = document.getElementById('hourly-section');
    const hourlyCanvas = document.getElementById('hourly-occupancy-chart');
    const hourlyTitle = document.getElementById('hourly-title');

    if (!hourlySection || !hourlyCanvas) return existingChart;

    hourlySection.style.display = 'block';

    if (hourlyTitle) {
        hourlyTitle.textContent = `Hourly Occupancy — ${DAYS[dayIndex]}`;
    }

    if (existingChart) {
        existingChart.destroy();
    }

    const hours = Array.from({ length: 24 }, (_, i) => {
        const h = i % 12 === 0 ? 12 : i % 12;
        return `${h}${i < 12 ? 'am' : 'pm'}`;
    });

    const newChart = new window.Chart(hourlyCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: hours,
            datasets: [{
                label: 'Vehicle Detections',
                data: hourlyCounts,
                borderColor: '#991b1b',
                backgroundColor: 'rgba(153, 27, 27, 0.08)',
                pointBackgroundColor: '#991b1b',
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => `Hour: ${items[0].label}`,
                        label: (item) => `Detections: ${item.raw}`,
                    },
                },
            },
            scales: {
                x: { grid: { color: 'rgba(0,0,0,0.04)' } },
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
            },
        },
    });

    setTimeout(() => {
        hourlySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    return newChart;
}

// --- Daily Table ---

function renderDailyTable(dailyTable, tableBody) {
    if (!tableBody) return;

    if (!dailyTable || dailyTable.length === 0) {
        tableBody.innerHTML = `
            <tr><td colspan="4" class="px-4 py-4 text-center text-gray-400">No data available for this week.</td></tr>
        `;
        return;
    }

    tableBody.innerHTML = dailyTable.map((counts, index) => {
        const inCount = counts[0];
        const outCount = counts[1];
        const net = inCount - outCount;
        const netClass = net > 0 ? 'text-green-600' : net < 0 ? 'text-red-500' : 'text-gray-400';
        const netSign = net > 0 ? '+' : '';

        return `
            <tr class="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3 font-semibold text-gray-700">${DAYS[index]}</td>
                <td class="px-4 py-3 text-green-600 font-bold">${inCount}</td>
                <td class="px-4 py-3 text-red-500 font-bold">${outCount}</td>
                <td class="px-4 py-3 font-semibold ${netClass}">${netSign}${net}</td>
            </tr>
        `;
    }).join('');
}

// --- UI Helpers ---

function setLoadingState(isLoading, tableBody) {
    if (!tableBody) return;
    if (isLoading) {
        tableBody.innerHTML = `
            <tr><td colspan="4" class="px-4 py-4 text-center text-gray-400 animate-pulse">Loading entry data...</td></tr>
        `;
    }
}

function showError(message, tableBody) {
    if (tableBody) {
        tableBody.innerHTML = `
            <tr><td colspan="4" class="px-4 py-4 text-center text-red-500">${message}</td></tr>
        `;
    }
}