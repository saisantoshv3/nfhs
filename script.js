// State Setup
let rawData = [];
let geoJsonData = null;
let currentCategory = "";
let currentIndicator = "";
let currentRegion = "Total";
let filteredDataMap = {}; // State -> { nfhs5, nfhs4 }
let colorScale;

const map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false
}).setView([22.5937, 78.9629], 4.5); // India center

// L.control.zoom({ position: 'topright' }).addTo(map);

let geojsonLayer;
let chartInstance;

Chart.defaults.color = '#64748b';
Chart.defaults.font.family = 'Inter';

// Load Data
async function init() {
    try {
        const [geoRes, csvRes] = await Promise.all([
            fetch('data/india_states.geojson').then(r => r.json()),
            fetch('data/data.csv').then(r => r.text())
        ]);
        
        geoJsonData = geoRes;
        
        Papa.parse(csvRes, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                rawData = results.data;
                populateCategories();
            }
        });
    } catch (err) {
        console.error("Error loading data:", err);
    }
}

// Normalizer for state names
function normName(name) {
    if(!name) return "";
    return name.toLowerCase().replace(/ and /g, ' & ').replace(/[^a-z0-9]/g, '');
}

function processData() {
    filteredDataMap = {};
    const filtered = rawData.filter(d => 
        d.category === currentCategory && 
        d.indicator === currentIndicator && 
        d.region === currentRegion
    );

    let unit = "";
    let note = "";
    
    filtered.forEach(d => {
        if (!unit && d.unit) unit = d.unit;
        if (!note && d.note) note = d.note;
        
        const st = normName(d.state);
        filteredDataMap[st] = {
            nfhs5: parseFloat(d.nfhs_5),
            nfhs4: parseFloat(d.nfhs_4),
            originalName: d.state
        };
    });

    // Update UI Stats
    document.getElementById('reg-badge').textContent = currentRegion;
    document.getElementById('stat-unit').textContent = unit.replace(/nfhs_4, nfhs_5 in /i, '');
    document.getElementById('stat-note').textContent = note;
    
    const allInd = filteredDataMap[normName("All India")];
    if (allInd) {
        document.getElementById('all-india-nfhs5').textContent = isNaN(allInd.nfhs5) ? '-' : allInd.nfhs5;
        document.getElementById('all-india-nfhs4').textContent = isNaN(allInd.nfhs4) ? '-' : allInd.nfhs4;
    } else {
        document.getElementById('all-india-nfhs5').textContent = '-';
        document.getElementById('all-india-nfhs4').textContent = '-';
    }

    updateMap();
    updateChart();
}

function updateMap() {
    if (geojsonLayer) map.removeLayer(geojsonLayer);
    
    // Determine sentiment of indicator
    const negativeKeywords = ['anaemic', 'anaemia', 'violence', 'mortality', 'high risk', 'unmet need', 'sugar level - high', 'elevated blood pressure', 'hypertension', 'caesarean', 'expenditure', 'overweight', 'obese', 'stunted', 'underweight', 'wasted', 'severe', 'diarrhoea', 'fever', 'tobacco', 'alcohol', 'out of pocket', 'below normal'];
    
    const isNegative = negativeKeywords.some(kw => currentIndicator.toLowerCase().includes(kw));

    // Calculate domain for color scale
    let values = Object.keys(filteredDataMap)
        .filter(k => k !== normName("All India"))
        .map(k => filteredDataMap[k].nfhs5)
        .filter(v => !isNaN(v));

    if (values.length === 0) values = [0, 100];
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Gradient definitions: matching the requested red-white-blue image palette
    // adding darker extremes to provide the visual depth shown in the uploaded map
    let colors;
    if (isNegative) {
        // High is bad (Dark Red), Low is good (Dark Blue)
        colors = ['#01426a', '#038DD2', '#AAC5CC', '#F38978', '#c8102e'];
    } else {
        // High is good (Dark Blue), Low is bad (Dark Red)
        colors = ['#c8102e', '#F38978', '#AAC5CC', '#038DD2', '#01426a'];
    }

    colorScale = chroma.scale(colors).mode('lch').domain([min, max]);

    geojsonLayer = L.geoJson(geoJsonData, {
        style: feature => {
            const stName = normName(feature.properties.ST_NM);
            const val = filteredDataMap[stName] ? filteredDataMap[stName].nfhs5 : NaN;
            return {
                fillColor: isNaN(val) ? '#e2e8f0' : colorScale(val).hex(),
                weight: 0.5,
                opacity: 1,
                color: '#ffffff',
                fillOpacity: 1
            };
        },
        onEachFeature: (feature, layer) => {
            const stName = normName(feature.properties.ST_NM);
            const data = filteredDataMap[stName];
            const val5 = data && !isNaN(data.nfhs5) ? data.nfhs5 : 'N/A';
            const val4 = data && !isNaN(data.nfhs4) ? data.nfhs4 : 'N/A';
            
            const tooltipContent = `
                <div class="map-tooltip">
                    <b>${feature.properties.ST_NM}</b>
                    NFHS-5: ${val5}<br>
                    NFHS-4: ${val4}
                </div>
            `;
            layer.bindTooltip(tooltipContent, { sticky: true, className: 'map-tooltip', direction: 'auto' });
            
            layer.on({
                mouseover: e => {
                    const l = e.target;
                    l.setStyle({ weight: 2, color: '#333333', fillOpacity: 1 });
                    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                        l.bringToFront();
                    }
                },
                mouseout: e => {
                    geojsonLayer.resetStyle(e.target);
                }
            });
        }
    }).addTo(map);
    
    // Fit the map to exactly the bounding box of India so it is fully visible
    map.fitBounds(geojsonLayer.getBounds(), { padding: [10, 10] });
}

function updateChart() {
    const statesData = Object.values(filteredDataMap)
        .filter(d => d.originalName.toLowerCase() !== "all india" && !isNaN(d.nfhs5))
        .sort((a, b) => b.nfhs5 - a.nfhs5); // Descending

    const labels = statesData.map(d => d.originalName);
    const dataPoints = statesData.map(d => d.nfhs5);
    
    // Get All India value
    const allInd = filteredDataMap[normName("All India")];
    const allIndiaVal = allInd && !isNaN(allInd.nfhs5) ? allInd.nfhs5 : null;

    // Array of colors for chart corresponding to the color scale
    const barColors = statesData.map(d => colorScale(d.nfhs5).hex());

    if (chartInstance) chartInstance.destroy();

    const ctx = document.getElementById('rankingChart').getContext('2d');
    
    const datasets = [{
        type: 'bar',
        label: 'State Value',
        data: dataPoints,
        backgroundColor: barColors,
        borderRadius: 4
    }];
    
    if (allIndiaVal !== null) {
        datasets.push({
            type: 'line',
            label: 'All India Avg',
            data: labels.map(() => allIndiaVal),
            borderColor: '#1e293b',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
        });
    }
    
    chartInstance = new Chart(ctx, {
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1e293b',
                    bodyColor: '#1e293b',
                    borderColor: 'rgba(0,0,0,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 6
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                y: {
                    grid: { display: false },
                    ticks: { autoSkip: false, font: { size: 9 } }
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
