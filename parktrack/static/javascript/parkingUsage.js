document.addEventListener('DOMContentLoaded', function() {
    initializeParkingUsage();
});

export async function initializeParkingUsage() {
    console.log('Initializing dynamic parking usage dashboard...');
    
    const canvas = document.getElementById('peak-occupancy-chart');
    const tableBody = document.getElementById('vehicle-entries-body');

    if (!canvas) {
        console.error('Peak occupancy chart canvas not found');
        return;
    }

    const context = canvas.getContext('2d');
    const ChartLib = window.Chart;

    if (!ChartLib) {
        console.error('Chart.js library not found.');
        return;
    }

    let hourlyChart = null;

    try {
        // 1. Fetch Real Data from your Django API
        const response = await fetch('/parking_usage/api/stats/');
        const data = await response.json();

        // 2. Update the Daily Vehicle Entries Table
        if (tableBody) {
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            tableBody.innerHTML = ''; // Clear the "Loading..." or static rows
            
            // data.daily_table contains the weekly totals from Django
            data.daily_table.forEach((count, index) => {
                const row = `
                    <tr class="border-t border-gray-300 hover:bg-gray-50">
                        <td class="px-4 py-3 font-semibold text-gray-700">${days[index]}</td>
                        <td class="px-4 py-3 text-green-600 font-bold">${count}</td>
                        <td class="px-4 py-3 text-gray-400">--</td>
                    </tr>
                `;
                tableBody.innerHTML += row;
            });
        }

        // 3. Create the Main Bar Chart (Daily Totals)
        new ChartLib(context, {
            type: 'bar',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Total Vehicles',
                    data: data.daily_table, // Real data from backend
                    backgroundColor: '#991b1b',
                    borderRadius: 8,
                    hoverBackgroundColor: '#dc2626'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                },
                onClick: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        // When a bar is clicked, show the 24-hour breakdown
                        showHourlyChart(data.hourly_counts);
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }

    // Function to render the 24-hour line chart
    function showHourlyChart(hourlyCounts) {
        const hourlySection = document.getElementById('hourly-section');
        const hourlyCanvas = document.getElementById('hourly-occupancy-chart');
        
        if (hourlySection) hourlySection.style.display = 'block';
        if (hourlyChart) hourlyChart.destroy();

        hourlyChart = new ChartLib(hourlyCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: Array.from({length: 24}, (_, i) => `${i}:00`),
                datasets: [{
                    label: 'Hourly Detections',
                    data: hourlyCounts,
                    borderColor: '#991b1b',
                    backgroundColor: 'rgba(153, 27, 27, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });

        setTimeout(() => {
            hourlySection.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
}