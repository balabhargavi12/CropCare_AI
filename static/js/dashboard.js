// Dashboard functionality
document.addEventListener('DOMContentLoaded', function() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const resultsSection = document.getElementById('results-section');
    const previewImage = document.getElementById('preview-image');

    // Load weather data
    fetchWeatherData();

    // Load crop health data
    fetchCropHealthData();

    // Initialize theme
    initializeTheme();

    // Setup drag and drop
    dropZone.addEventListener('click', function() {
        fileInput.click();
    });

    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', function() {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', function(e) {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    function handleFile(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
        uploadImage(file);
    }

    async function uploadImage(file) {
        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch('/predict', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                displayResults(data);
            } else {
                alert(data.message || 'Prediction failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('An error occurred during image analysis');
        }
    }

    function displayResults(data) {
        resultsSection.style.display = 'block';
        document.getElementById('disease-result').textContent = data.prediction;
        document.getElementById('confidence-result').textContent = data.confidence;
        document.getElementById('crop-type-result').textContent = data.crop_type;
        document.getElementById('health-status').textContent = 
            data.is_healthy ? '✅ Healthy' : '⚠️ Disease Detected';

        const recommendations = document.getElementById('recommendations');
        if (data.is_healthy) {
            recommendations.innerHTML = `
                <h3>Maintenance Recommendations</h3>
                <ul>
                    <li>Continue regular monitoring</li>
                    <li>Maintain proper irrigation</li>
                    <li>Ensure adequate nutrients</li>
                    <li>Practice crop rotation</li>
                </ul>
            `;
        } else {
            recommendations.innerHTML = `
                <h3>Treatment Recommendations</h3>
                <ul>
                    <li>Isolate affected plants</li>
                    <li>Consider appropriate treatment</li>
                    <li>Monitor surrounding plants</li>
                    <li>Consult local agricultural expert</li>
                </ul>
            `;
        }
    }
});

// Fetch weather data from API
function fetchWeatherData() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            var lat = position.coords.latitude;
            var lon = position.coords.longitude;
            getWeatherData(lat, lon);
        }, function(error) {
            console.error('Geolocation error:', error);
            getWeatherData();
        });
    } else {
        getWeatherData();
    }
}

function getWeatherData(lat, lon) {
    lat = lat || 40.7128;
    lon = lon || -74.0060;

    let url = '/weather';
    if (lat && lon) {
        url += `?lat=${lat}&lon=${lon}`;
    }

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Weather API error:', data.error);
                document.getElementById('weather-container').innerHTML = `
                    <div class="alert alert-warning">
                        Unable to load weather data. Please try again later.
                    </div>
                `;
                return;
            }

            const current = data.current;
            // Populate existing elements in template
            var locEl = document.getElementById('weather-location');
            if (locEl) locEl.textContent = current.location || 'Unknown';
            var tempEl = document.getElementById('current-temp');
            if (tempEl) tempEl.textContent = `${Math.round(current.temp)}°C`;
            var descEl = document.getElementById('weather-desc');
            if (descEl) descEl.textContent = capitalize(current.description || '')
            var humEl = document.getElementById('humidity');
            if (humEl) humEl.textContent = `${current.humidity || 0}%`;
            var windEl = document.getElementById('wind-speed');
            if (windEl) windEl.textContent = `${Math.round((current.wind_speed || 0) * 3.6)} km/h`;
            var visEl = document.getElementById('visibility');
            if (visEl && current.visibility !== undefined) visEl.textContent = `${Math.round(current.visibility/1000)} km`;
            var rainEl = document.getElementById('rainfall');
            if (rainEl && current.rainfall !== undefined) rainEl.textContent = `${current.rainfall} mm`;

            // Forecast list
            var forecastContainer = document.getElementById('forecast-container');
            if (forecastContainer) {
                forecastContainer.innerHTML = '';
                data.forecast.slice(0,3).forEach(function(day){
                    var date = new Date(day.date);
                    var weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
                    var item = document.createElement('div');
                    item.className = 'forecast-item';
                    item.innerHTML = `
                        <div class="forecast-day">${weekday}</div>
                        <div class="forecast-temp">${Math.round(day.temp)}°C</div>
                        <div class="forecast-condition">${capitalize(day.description)}</div>
                    `;
                    forecastContainer.appendChild(item);
                });
            }

            // Advisory (show if any forecast mentions rain)
            var advisory = document.getElementById('weather-advisory');
            if (advisory) {
                var hasRain = (data.forecast || []).some(function(d){ return String(d.description || '').toLowerCase().includes('rain'); });
                advisory.style.display = hasRain ? 'flex' : 'none';
            }
        })
        .catch(error => {
            console.error('Error fetching weather data:', error);
            document.getElementById('weather-container').innerHTML = `
                <div class="alert alert-danger">
                    Error loading weather data. Please try again later.
                </div>
            `;
        });
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fetchCropHealthData() {
    fetch('/crop_health')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Crop health data error:', data.error);
                document.getElementById('crop-health-container').innerHTML = `
                    <div class="alert alert-warning">
                        Unable to load crop health data. Please try again later.
                    </div>
                `;
                return;
            }

            createCropHealthChart(data);
        })
        .catch(error => {
            console.error('Error fetching crop health data:', error);
            document.getElementById('crop-health-container').innerHTML = `
                <div class="alert alert-danger">
                    Error loading crop health data. Please try again later.
                </div>
            `;
        });
}

function createCropHealthChart(data) {
    var container = document.getElementById('crop-health-container');
    if (!container) return;

    if (!Array.isArray(data) || data.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                No crop data available. Upload some images to see crop health statistics.
            </div>
        `;
        var alertsElEmpty = document.getElementById('alerts-count');
        if (alertsElEmpty) alertsElEmpty.textContent = '0';
        return;
    }

    // Update Alerts KPI with total diseased count
    var alerts = data.reduce(function(sum, item){ return sum + (item.diseased || 0); }, 0);
    var alertsEl = document.getElementById('alerts-count');
    if (alertsEl) alertsEl.textContent = alerts;

    // Render crop health rows
    container.innerHTML = '';
    data.forEach(function(item){
        var percent = item.health_percentage != null ? Math.round(item.health_percentage) :
                      (item.total ? Math.round((item.healthy / item.total) * 100) : 0);
        var cls = percent >= 85 ? 'good' : (percent >= 60 ? 'warn' : 'bad');

        var row = document.createElement('div');
        row.className = 'health-row';
        row.innerHTML = `
            <div class="health-label"><span class="status-dot ${cls}"></span> ${capitalize(item.crop_type || 'Field')}</div>
            <div class="health-progress"><div class="health-bar ${cls}" style="width:${percent}%;"></div></div>
            <div class="health-percent">${percent}%</div>
        `;
        container.appendChild(row);
    });
}

// Utility helpers
function capitalize(str) {
    str = String(str || '');
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// Optional: Define initializeTheme if it's not already in your code
function initializeTheme() {
    // Placeholder functionality
    console.log("Theme initialized");
}
