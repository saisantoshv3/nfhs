let rawData = [];
let currentCategory = "";
let currentIndicator = "";
let currentRegion = "Total";
let chartInstance;

Chart.defaults.color = '#64748b';
Chart.defaults.font.family = 'Inter';

async function init() {
    try {
        const csvRes = await fetch('data/data.csv').then(r => r.text());
        Papa.parse(csvRes, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                // Filter to only rows that have both nfhs_4 and nfhs_5 values parsed as numbers
                rawData = results.data.filter(d => !isNaN(parseFloat(d.nfhs_4)) && !isNaN(parseFloat(d.nfhs_5)));
                populateCategories();
            }
        });
    } catch (err) {
        console.error("Error loading data:", err);
    }
}

function processData() {
    const filtered = rawData.filter(d => 
        d.category === currentCategory && 
        d.indicator === currentIndicator && 
        d.region === currentRegion
    );

    let unit = "";
    let note = "";
    const scatterPoints = [];
    let allInd4 = '-';
    let allInd5 = '-';
    
    filtered.forEach(d => {
        if (!unit && d.unit) unit = d.unit;
        if (!note && d.note) note = d.note;
        
        const n4 = parseFloat(d.nfhs_4);
        const n5 = parseFloat(d.nfhs_5);
        
        if (d.state.toLowerCase() === "all india") {
            allInd4 = n4;
            allInd5 = n5;
        } else {
            scatterPoints.push({
                x: n4,
                y: n5,
                stateName: d.state
            });
        }
    });

    // Update UI Stats
    document.getElementById('reg-badge').textContent = currentRegion;
    document.getElementById('stat-unit').textContent = unit.replace(/nfhs_4, nfhs_5 in /i, '');
    document.getElementById('stat-note').textContent = note;
    document.getElementById('all-india-nfhs5').textContent = allInd5;
    document.getElementById('all-india-nfhs4').textContent = allInd4;

    updateChart(scatterPoints, unit);
}

function updateChart(scatterPoints, unit) {
    if (chartInstance) chartInstance.destroy();

    const ctx = document.getElementById('scatterChart').getContext('2d');
    
    // Determine sentiment for indicator (same logic as map)
    const negativeKeywords = ['anaemic', 'anaemia', 'violence', 'mortality', 'high risk', 'unmet need', 'sugar level - high', 'elevated blood pressure', 'hypertension', 'caesarean', 'expenditure', 'overweight', 'obese', 'stunted', 'underweight', 'wasted', 'severe', 'diarrhoea', 'fever', 'tobacco', 'alcohol', 'out of pocket', 'below normal'];
    const isNegative = negativeKeywords.some(kw => currentIndicator.toLowerCase().includes(kw));

    // Determine color for each state
    const pointColors = scatterPoints.map(p => {
        if (p.x === p.y) return '#94a3b8'; // No change -> Grey
        
        const increased = p.y > p.x;
        
        if (isNegative) {
            // It's a bad thing. Increase = Bad (Red), Decrease = Good (Blue)
            return increased ? '#c8102e' : '#038DD2';
        } else {
            // It's a good thing. Increase = Good (Blue), Decrease = Bad (Red)
            return increased ? '#038DD2' : '#c8102e';
        }
    });

    // Calculate domain to draw the y=x diagonal line
    let minVal = 0, maxVal = 100;
    if (scatterPoints.length > 0) {
        const allX = scatterPoints.map(p => p.x);
        const allY = scatterPoints.map(p => p.y);
        minVal = Math.min(...allX, ...allY);
        maxVal = Math.max(...allX, ...allY);
        // Add some padding
        minVal = Math.max(0, minVal - (maxVal - minVal) * 0.1);
        maxVal = maxVal + (maxVal - minVal) * 0.1;
    }

    chartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'States',
                    data: scatterPoints,
                    backgroundColor: pointColors,
                    pointRadius: 6,
                    pointHoverRadius: 8
                },
                {
                    label: 'No Change Line (NFHS 4 = NFHS 5)',
                    data: [{x: minVal, y: minVal}, {x: maxVal, y: maxVal}],
                    type: 'line',
                    borderColor: '#94a3b8',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1e293b',
                    bodyColor: '#1e293b',
                    borderColor: 'rgba(0,0,0,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 6,
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 1) return 'No Change Line';
                            const pt = context.raw;
                            return `${pt.stateName}: NFHS-4 (${pt.x}), NFHS-5 (${pt.y})`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: { display: true, text: 'NFHS-4 Value' },
                    min: minVal,
                    max: maxVal
                },
                y: {
                    title: { display: true, text: 'NFHS-5 Value' },
                    min: minVal,
                    max: maxVal
                }
            }
        }
    });
}

function populateCategories() {
    const cats = [...new Set(rawData.map(d => d.category))].filter(Boolean).sort();
    const catSelect = document.getElementById('category');
    catSelect.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    
    catSelect.addEventListener('change', (e) => {
        currentCategory = e.target.value;
        populateIndicators();
    });
    
    if (cats.length > 0) {
        currentCategory = cats[0];
        populateIndicators();
    }
}

function populateIndicators() {
    const inds = [...new Set(rawData.filter(d => d.category === currentCategory).map(d => d.indicator))].filter(Boolean).sort();
    const indSelect = document.getElementById('indicator');
    indSelect.innerHTML = inds.map(i => `<option value="${i}">${i}</option>`).join('');
    
    indSelect.addEventListener('change', (e) => {
        currentIndicator = e.target.value;
        processData();
    });
    
    if (inds.length > 0) {
        currentIndicator = inds[0];
        processData();
    }
}

document.querySelectorAll('input[name="region"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        currentRegion = e.target.value;
        processData();
    });
});

init();
