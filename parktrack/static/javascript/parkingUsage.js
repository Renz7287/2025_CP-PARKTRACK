const DAYS     = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let dailyChartInstance  = null;
let hourlyChartInstance = null;

export async function initializeParkingUsage() {
    if (!document.querySelector('.parking-usage')) return;

    const canvas          = document.getElementById('peak-occupancy-chart');
    const tableBody       = document.getElementById('vehicle-entries-body');
    const summaryContainer = document.getElementById('summary-stats');

    if (!canvas) return;

    try {
        const response = await fetch('/parking-usage/api/stats/');
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const data = await response.json();

        renderSummaryCards(data.summary, summaryContainer);
        renderDailyTable(data.daily_table, tableBody);
        renderDailyChart(canvas, data.daily_table, data.hourly_by_day);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-4 py-6 text-center text-red-500">
                        Failed to load parking data. Please try refreshing.
                    </td>
                </tr>`;
        }
    }
}

function renderSummaryCards(summary, container) {
    if (!container || !summary) return;

    const cards = [
        {
            label: 'Total Entries',
            value: summary.total_entries ?? 0,
            icon:  '🚗',
            color: 'text-green-700',
            bg:    'bg-green-50',
            border:'border-green-200',
        },
        {
            label: 'Total Exits',
            value: summary.total_exits ?? 0,
            icon:  '🚙',
            color: 'text-red-700',
            bg:    'bg-red-50',
            border:'border-red-200',
        },
        {
            label: 'Peak Hour',
            value: summary.peak_hour ?? 'N/A',
            icon:  '⏰',
            color: 'text-blue-700',
            bg:    'bg-blue-50',
            border:'border-blue-200',
        },
        {
            label: 'Busiest Day',
            value: summary.peak_day ?? 'N/A',
            icon:  '📅',
            color: 'text-purple-700',
            bg:    'bg-purple-50',
            border:'border-purple-200',
        },
    ];

    container.innerHTML = cards.map(card => `
        <div class="flex items-center gap-4 bg-white rounded-xl shadow-sm border ${card.border} px-5 py-5">
            <div class="${card.bg} ${card.color} text-2xl w-12 h-12 flex items-center justify-center rounded-xl">
                ${card.icon}
            </div>
            <div>
                <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">${card.label}</p>
                <p class="text-2xl font-bold text-gray-800 mt-0.5">${card.value}</p>
            </div>
        </div>
    `).join('');
}

function renderDailyChart(canvas, dailyTable, hourlyByDay) {
    if (dailyChartInstance) {
        dailyChartInstance.destroy();
        dailyChartInstance = null;
    }

    const inCounts  = dailyTable.map(d => d[0]);
    const outCounts = dailyTable.map(d => d[1]);

    dailyChartInstance = new window.Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: DAY_ABBR,
            datasets: [
                {
                    label: 'Entries',
                    data: inCounts,
                    backgroundColor: 'rgba(22,163,74,0.85)',
                    borderRadius: 6,
                    hoverBackgroundColor: '#15803d',
                },
                {
                    label: 'Exits',
                    data: outCounts,
                    backgroundColor: 'rgba(220,38,38,0.85)',
                    borderRadius: 6,
                    hoverBackgroundColor: '#b91c1c',
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
                    labels: { usePointStyle: true, pointStyleWidth: 10, padding: 20 },
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
                if (!activeElements.length) return;
                const dayIndex   = activeElements[0].index;
                const hourlyData = hourlyByDay[String(dayIndex)] || hourlyByDay[dayIndex] || new Array(24).fill(0);
                showHourlyChart(dayIndex, hourlyData);
            },
        },
    });
}

function showHourlyChart(dayIndex, hourlyCounts) {
    const hourlySection = document.getElementById('hourly-section');
    const hourlyCanvas  = document.getElementById('hourly-occupancy-chart');
    const hourlyTitle   = document.getElementById('hourly-title');

    if (!hourlySection || !hourlyCanvas) return;

    hourlySection.style.display = 'block';
    if (hourlyTitle) hourlyTitle.textContent = `Hourly Breakdown — ${DAYS[dayIndex]}`;

    if (hourlyChartInstance) {
        hourlyChartInstance.destroy();
        hourlyChartInstance = null;
    }

    const hours = Array.from({ length: 24 }, (_, i) => {
        const h = i % 12 === 0 ? 12 : i % 12;
        return `${h}${i < 12 ? 'am' : 'pm'}`;
    });

    hourlyChartInstance = new window.Chart(hourlyCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: hours,
            datasets: [{
                label: 'Vehicle Detections',
                data: hourlyCounts,
                borderColor: '#940B26',
                backgroundColor: 'rgba(148,11,38,0.08)',
                pointBackgroundColor: '#940B26',
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
                        label: (item)  => `Detections: ${item.raw}`,
                    },
                },
            },
            scales: {
                x: { grid: { color: 'rgba(0,0,0,0.04)' } },
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
            },
        },
    });

    setTimeout(() => hourlySection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

function renderDailyTable(dailyTable, tableBody) {
    if (!tableBody) return;

    if (!dailyTable || !dailyTable.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="px-4 py-6 text-center text-gray-400">
                    No data available for this week.
                </td>
            </tr>`;
        return;
    }

    tableBody.innerHTML = dailyTable.map((counts, index) => {
        const inCount  = counts[0];
        const outCount = counts[1];
        const net      = inCount - outCount;
        const netClass = net > 0 ? 'text-green-600' : net < 0 ? 'text-red-500' : 'text-gray-400';
        const netSign  = net > 0 ? '+' : '';

        return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3 font-semibold text-gray-700">${DAYS[index]}</td>
                <td class="px-4 py-3 font-bold text-green-600">${inCount}</td>
                <td class="px-4 py-3 font-bold text-red-500">${outCount}</td>
                <td class="px-4 py-3 font-semibold ${netClass}">${netSign}${net}</td>
            </tr>`;
    }).join('');
}