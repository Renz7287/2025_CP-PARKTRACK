const DAYS     = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let dailyChart    = null;
let donutChart    = null;
let slotChart     = null;
let hourlyChart   = null;

export async function initializeParkingUsage() {
    if (!document.querySelector('.parking-usage')) return;

    await waitForChart();

    try {
        const response = await fetch('/parking-usage/api/stats/');
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const data = await response.json();

        renderSummaryCards(data);
        renderDailyChart(data.daily_reservations);
        renderDonutChart(data.reservation_summary);
        renderSlotChart(data.slot_utilization);
        renderHourlyChart(data.hourly_reservations);
        renderTable(data.daily_reservations);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function waitForChart(timeout = 5000) {
    return new Promise((resolve, reject) => {
        if (window.Chart) { resolve(); return; }
        const start    = Date.now();
        const interval = setInterval(() => {
            if (window.Chart) {
                clearInterval(interval);
                resolve();
            } else if (Date.now() - start > timeout) {
                clearInterval(interval);
                reject(new Error('Chart.js failed to load'));
            }
        }, 50);
    });
}

function renderSummaryCards(data) {
    const container = document.getElementById('summary-stats');
    if (!container) return;

    const live    = data.live    || {};
    const summary = data.reservation_summary || {};
    const total   = live.total   || 0;
    const pct     = total > 0 ? Math.round((live.occupied / total) * 100) : 0;

    const cards = [
        {
            label:  'Currently Occupied',
            value:  live.available ? `${live.occupied} / ${live.total}` : 'Offline',
            sub:    live.available ? `${pct}% occupancy rate` : 'Pi not streaming',
            icon:   '🅿️',
            color:  'text-red-700',
            bg:     'bg-red-50',
            border: 'border-red-200',
        },
        {
            label:  'Currently Vacant',
            value:  live.available ? live.vacant : '--',
            sub:    'Available slots right now',
            icon:   '✅',
            color:  'text-green-700',
            bg:     'bg-green-50',
            border: 'border-green-200',
        },
        {
            label:  'Reservations This Week',
            value:  summary.total ?? 0,
            sub:    `${summary.active ?? 0} currently active`,
            icon:   '📋',
            color:  'text-blue-700',
            bg:     'bg-blue-50',
            border: 'border-blue-200',
        },
        {
            label:  'Peak Day',
            value:  data.peak_day ?? 'N/A',
            sub:    `Peak hour: ${data.peak_hour ?? 'N/A'}`,
            icon:   '📈',
            color:  'text-purple-700',
            bg:     'bg-purple-50',
            border: 'border-purple-200',
        },
    ];

    container.innerHTML = cards.map(card => `
        <div class="flex items-center gap-4 bg-white rounded-xl shadow-sm border ${card.border} px-5 py-5">
            <div class="${card.bg} ${card.color} text-2xl w-12 h-12 flex items-center justify-center rounded-xl shrink-0">
                ${card.icon}
            </div>
            <div class="min-w-0">
                <p class="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">${card.label}</p>
                <p class="text-2xl font-bold text-gray-800 mt-0.5">${card.value}</p>
                <p class="text-xs text-gray-400 mt-0.5">${card.sub}</p>
            </div>
        </div>
    `).join('');
}

function renderDailyChart(dailyReservations) {
    const canvas = document.getElementById('daily-reservations-chart');
    if (!canvas) return;
    if (dailyChart) { dailyChart.destroy(); dailyChart = null; }

    dailyChart = new window.Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: DAY_ABBR,
            datasets: [{
                label:                'Reservations',
                data:                 dailyReservations,
                backgroundColor:      'rgba(148,11,38,0.80)',
                borderRadius:         6,
                hoverBackgroundColor: '#7f0d24',
            }],
        },
        options: {
            responsive:          true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
            },
        },
    });
}

function renderDonutChart(summary) {
    const canvas = document.getElementById('status-donut-chart');
    if (!canvas) return;
    if (donutChart) { donutChart.destroy(); donutChart = null; }

    const values = [
        summary.active    ?? 0,
        summary.expired   ?? 0,
        summary.cancelled ?? 0,
        summary.fulfilled ?? 0,
    ];

    donutChart = new window.Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Active', 'Expired', 'Cancelled', 'Fulfilled'],
            datasets: [{
                data:            values,
                backgroundColor: ['#16a34a', '#6b7280', '#dc2626', '#2563eb'],
                borderWidth:     2,
                borderColor:     '#fff',
                hoverOffset:     6,
            }],
        },
        options: {
            responsive:          true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels:   { usePointStyle: true, padding: 16, font: { size: 12 } },
                },
            },
            cutout: '65%',
        },
    });
}

function renderSlotChart(slotUtilization) {
    const canvas = document.getElementById('slot-utilization-chart');
    if (!canvas) return;
    if (slotChart) { slotChart.destroy(); slotChart = null; }

    if (!slotUtilization.labels.length) {
        canvas.parentElement.innerHTML = `
            <p class="text-center text-gray-400 text-sm py-16">
                No reservation data yet.
            </p>`;
        return;
    }

    slotChart = new window.Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: slotUtilization.labels,
            datasets: [{
                label:                'Total Reservations',
                data:                 slotUtilization.counts,
                backgroundColor:      'rgba(37,99,235,0.80)',
                borderRadius:         6,
                hoverBackgroundColor: '#1d4ed8',
            }],
        },
        options: {
            responsive:          true,
            maintainAspectRatio: false,
            indexAxis:           'y',
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: { beginAtZero: true, ticks: { stepSize: 1 } },
                y: { grid: { display: false } },
            },
        },
    });
}

function renderHourlyChart(hourlyReservations) {
    const canvas = document.getElementById('hourly-reservations-chart');
    if (!canvas) return;
    if (hourlyChart) { hourlyChart.destroy(); hourlyChart = null; }

    const hours = Array.from({ length: 24 }, (_, i) => {
        const h = i % 12 === 0 ? 12 : i % 12;
        return `${h}${i < 12 ? 'am' : 'pm'}`;
    });

    hourlyChart = new window.Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: hours,
            datasets: [{
                label:                'Reservations',
                data:                 hourlyReservations,
                borderColor:          '#940B26',
                backgroundColor:      'rgba(148,11,38,0.08)',
                pointBackgroundColor: '#940B26',
                pointRadius:          3,
                pointHoverRadius:     5,
                fill:                 true,
                tension:              0.4,
            }],
        },
        options: {
            responsive:          true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: { grid: { color: 'rgba(0,0,0,0.04)' } },
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
            },
        },
    });
}

function renderTable(dailyReservations) {
    const tbody = document.getElementById('reservations-table-body');
    if (!tbody) return;

    if (!dailyReservations || !dailyReservations.some(v => v > 0)) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="px-4 py-6 text-center text-gray-400">
                    No reservations recorded this week.
                </td>
            </tr>`;
        return;
    }

    const max = Math.max(...dailyReservations);

    tbody.innerHTML = dailyReservations.map((count, index) => {
        const isToday  = index === new Date().getDay() - 1;
        const isPeak   = count === max && max > 0;
        const barWidth = max > 0 ? Math.round((count / max) * 100) : 0;

        return `
            <tr class="hover:bg-gray-50 transition-colors ${isToday ? 'bg-blue-50/40' : ''}">
                <td class="px-4 py-3 font-semibold text-gray-700">
                    ${DAYS[index]}
                    ${isToday  ? '<span class="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Today</span>'  : ''}
                    ${isPeak   ? '<span class="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Peak</span>'    : ''}
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                        <div class="flex-1 bg-gray-100 rounded-full h-2">
                            <div class="bg-[#940B26] h-2 rounded-full transition-all" style="width:${barWidth}%"></div>
                        </div>
                        <span class="font-bold text-gray-800 w-6 text-right">${count}</span>
                    </div>
                </td>
                <td class="px-4 py-3">
                    <span class="text-xs font-medium px-2 py-1 rounded-full ${count === 0 ? 'bg-gray-100 text-gray-500' : count === max ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">
                        ${count === 0 ? 'No activity' : count === max ? 'Busiest' : 'Normal'}
                    </span>
                </td>
            </tr>`;
    }).join('');
}