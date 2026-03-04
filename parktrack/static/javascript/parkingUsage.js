export async function initializeParkingUsage() {
    if (!document.querySelector('.parking-usage')) return;

    const canvas           = document.getElementById('peak-occupancy-chart');
    const tableBody        = document.getElementById('vehicle-entries-body');
    const summaryContainer = document.getElementById('summary-stats');

    if (!canvas) return;

    // Wait for Chart.js to load (injected via template script tag)
    await waitForChart();

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
                reject(new Error('Chart.js failed to load within timeout'));
            }
        }, 50);
    });
}