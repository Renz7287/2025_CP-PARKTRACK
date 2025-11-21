document.addEventListener('DOMContentLoaded', function() {
    initializeParkingUsage();
});

export function initializeParkingUsage() {
    console.log('Initializing parking usage charts...');
    
    const canvas = document.getElementById('peak-occupancy-chart');

    if (!canvas) {
        console.error('Peak occupancy chart canvas not found');
        return;
    }

    const context = canvas.getContext('2d');
    const ChartLib = window.Chart;

    if (!ChartLib) {
        console.error('Chart.js library not found. Make sure Chart.js is loaded.');
        return;
    }

    // static hourly data
    const hourlyData = {
        'Mon': [5, 15, 35, 45, 50, 52, 48, 45, 40, 35, 25, 15],
        'Tue': [3, 12, 25, 35, 38, 40, 38, 35, 30, 25, 18, 12],
        'Wed': [2, 8, 18, 25, 27, 28, 26, 24, 20, 18, 12, 8],
        'Thur': [4, 10, 22, 30, 35, 36, 34, 32, 28, 22, 16, 10],
        'Fri': [2, 6, 12, 16, 18, 20, 18, 16, 14, 10, 8, 4],
        'Sat': [1, 3, 6, 8, 10, 12, 10, 8, 6, 4, 2, 1],
        'Sun': [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 1, 0]
    };

    const timeLabels = ['6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', 
                       '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];

    let hourlyChart = null;

    //bar chart 
    const mainChart = new ChartLib(context, {
        type: 'bar',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                data: [50, 38, 27, 35, 18, 10, 4],
                backgroundColor: [
                    '#991b1b', '#991b1b', '#6b7280', '#991b1b', '#6b7280', '#6b7280', '#6b7280'
                ],
                borderRadius: 8,
                hoverBackgroundColor: [
                    '#dc2626', '#dc2626', '#9ca3af', '#dc2626', '#9ca3af', '#9ca3af', '#9ca3af'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            return context[0].label + ' - Peak Occupancy';
                        },
                        label: function(context) {
                            return 'Vehicles: ' + context.parsed.y;
                        },
                        afterLabel: function(context) {
                            return 'Click to view hourly breakdown';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 5 }
                }
            },
            onHover: (event, activeElements) => {
                canvas.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
            },
            onClick: (event, activeElements) => {
                console.log('Chart clicked:', activeElements);
                if (activeElements && activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const dayLabel = mainChart.data.labels[index];
                    console.log('Clicked day:', dayLabel);
                    showHourlyChart(dayLabel);
                } else {
                    console.log('No active elements found');
                }
            }
        }
    });

    console.log('Main chart created successfully');

    // show hourly chart 
    function showHourlyChart(day) {
        console.log('Showing hourly chart for:', day);
        
        // day name for title
        const dayNames = {
            'Mon': 'Monday',
            'Tue': 'Tuesday', 
            'Wed': 'Wednesday',
            'Thur': 'Thursday',
            'Fri': 'Friday',
            'Sat': 'Saturday',
            'Sun': 'Sunday'
        };

        // hourly section
        const hourlySection = document.getElementById('hourly-section');
        if (hourlySection) {
            hourlySection.style.display = 'block';
            
            // Update title
            const title = hourlySection.querySelector('h2');
            if (title) {
                title.textContent = `${dayNames[day]} Hourly Occupancy`;
            }
        } else {
            console.error('Hourly section not found in HTML');
            return;
        }

       
        if (hourlyChart) {
            hourlyChart.destroy();
            hourlyChart = null;
        }

    
        const hourlyCanvasElement = document.getElementById('hourly-occupancy-chart');
        if (!hourlyCanvasElement) {
            console.error('Hourly chart canvas not found');
            return;
        }

        const hourlyContext = hourlyCanvasElement.getContext('2d');

        // Create new hourly chart
        hourlyChart = new ChartLib(hourlyContext, {
            type: 'line',
            data: {
                labels: timeLabels,
                datasets: [{
                    label: `${dayNames[day]} Occupancy`,
                    data: hourlyData[day],
                    borderColor: '#991b1b',
                    backgroundColor: 'rgba(153, 27, 27, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#991b1b',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            title: function(context) {
                                return `${dayNames[day]} - ${context[0].label}`;
                            },
                            label: function(context) {
                                return `Vehicles: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Time of Day'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Vehicles'
                        },
                        ticks: { stepSize: 5 }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });

        console.log('Hourly chart created for', day);

        // Scrolling the chart
        setTimeout(() => {
            hourlySection.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
}


if (typeof module === 'undefined') {
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeParkingUsage);
    } else {
        initializeParkingUsage();
    }
}