export function initializeParkingUsage() {
    const canvas = document.getElementById('peak-occupancy-chart');

    if (!canvas) return;

    const context = canvas.getContext('2d');
    const ChartLib = window.Chart;

    new ChartLib(context, {
        type: 'bar',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat', 'Sun'],
            datasets: [{
            data: [50, 38, 27, 35, 18, 10, 4],
            backgroundColor: [
                '#991b1b', '#991b1b', '#6b7280', '#991b1b', '#6b7280', '#6b7280', '#6b7280'
            ],
            borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
            legend: { display: false }
            },
            scales: {
            y: {
                beginAtZero: true,
                ticks: { stepSize: 5 }
            }
            }
        }
    });
}