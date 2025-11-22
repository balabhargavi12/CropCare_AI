// Enhanced Prediction page functionality
// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 
                           type === 'error' ? 'fa-exclamation-circle' : 
                           'fa-info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Show with animation
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

document.addEventListener('DOMContentLoaded', function() {
    // Updated element selectors for new HTML structure
    const fileUploadArea = document.getElementById('file-upload-area');
    const imageInput = document.getElementById('image-input');
    const previewContainer = document.getElementById('image-preview-container');
    const previewImg = document.getElementById('preview-img');
    const removeImageBtn = document.getElementById('remove-image');
    const predictionForm = document.getElementById('prediction-form');
    const predictBtn = document.getElementById('predict-btn');
    const loadingCard = document.getElementById('loading-card');
    const resultsSection = document.getElementById('results-section');
    const previewImage = document.getElementById('preview-image');
    const downloadBtn = document.getElementById('download-report-btn');
    const analyzeAnotherBtn = document.getElementById('analyze-another');
    const viewHistoryBtn = document.getElementById('view-history');

    // Setup drag and drop functionality
    fileUploadArea.addEventListener('click', () => imageInput.click());

    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.classList.add('drag-over');
    });

    fileUploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('drag-over');
    });

    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // File input change handler
    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    // Remove image handler
    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', () => {
            clearImagePreview();
        });
    }

    // Form submission handler
    if (predictionForm) {
        predictionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (imageInput.files.length) {
                startPrediction(imageInput.files[0]);
            }
        });
    }

    // Button event handlers
    if (downloadBtn) {
        downloadBtn.addEventListener('click', generateReport);
    }

    if (analyzeAnotherBtn) {
        analyzeAnotherBtn.addEventListener('click', () => {
            clearImagePreview();
            hideResults();
        });
    }

    if (viewHistoryBtn) {
        viewHistoryBtn.addEventListener('click', () => {
            window.location.href = '/history';
        });
    }

    // File validation
    function validateFile(file) {
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        const maxSize = 10 * 1024 * 1024; // 10MB

        if (!validTypes.includes(file.type)) {
            showNotification('Please select a valid image file (JPG, PNG)', 'error');
            return false;
        }

        if (file.size > maxSize) {
            showNotification('File size must be less than 10MB', 'error');
            return false;
        }

        return true;
    }

    function handleFile(file) {
        if (!validateFile(file)) return;

        // Show image preview
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            previewContainer.style.display = 'block';
            fileUploadArea.style.display = 'none';
            
            // Update image info
            document.getElementById('image-name').textContent = file.name;
            document.getElementById('image-size').textContent = formatFileSize(file.size);
            
            // Add fade-in animation
            previewContainer.classList.add('fade-in-up');
        };
        reader.readAsDataURL(file);
    }

    function clearImagePreview() {
        previewContainer.style.display = 'none';
        fileUploadArea.style.display = 'block';
        previewImg.src = '';
        imageInput.value = '';
        document.getElementById('image-name').textContent = '';
        document.getElementById('image-size').textContent = '';
    }

    function startPrediction(file) {
        // Hide upload card and show loading
        document.querySelector('.upload-card').style.display = 'none';
        loadingCard.style.display = 'block';
        loadingCard.classList.add('fade-in-up');
        
        // Start progress animation
        animateProgress();
        
        // Upload and get prediction
        uploadImage(file);
    }

    function animateProgress() {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        let progress = 0;
        
        const interval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 90) progress = 90;
            
            progressFill.style.width = progress + '%';
            progressText.textContent = Math.round(progress) + '%';
            
            if (progress >= 90) {
                clearInterval(interval);
            }
        }, 200);
        
        // Store interval for cleanup
        window.progressInterval = interval;
    }

    function completeProgress() {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        if (window.progressInterval) {
            clearInterval(window.progressInterval);
        }
        
        progressFill.style.width = '100%';
        progressText.textContent = '100%';
        
        setTimeout(() => {
            loadingCard.style.display = 'none';
        }, 500);
    }

    function hideResults() {
        resultsSection.style.display = 'none';
        document.querySelector('.upload-card').style.display = 'block';
    }

    async function uploadImage(file) {
        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch('/predict', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                completeProgress();
                setTimeout(() => {
                    displayResults(result);
                }, 600);
            } else {
                completeProgress();
                showNotification('Upload failed. Please try again.', 'error');
                hideResults();
            }
        } catch (error) {
            console.error('Error:', error);
            completeProgress();
            showNotification('Network error. Please check your connection.', 'error');
            hideResults();
        }
    }

    function displayResults(data) {
        // Show results section with animation
        resultsSection.style.display = 'block';
        resultsSection.classList.add('fade-in-up');
        resultsSection.scrollIntoView({ behavior: 'smooth' });

        // Update results with new element IDs
        const diseaseResult = document.getElementById('disease-result');
        const confidenceResult = document.getElementById('confidence-result');
        const cropTypeResult = document.getElementById('crop-type-result');
        const healthStatus = document.getElementById('health-status');
        const statusIcon = document.getElementById('status-icon');
        const confidenceBar = document.getElementById('confidence-bar');
        const previewResultImg = document.getElementById('preview-image');

        if (diseaseResult) diseaseResult.textContent = data.prediction || 'Unknown';
        if (confidenceResult) confidenceResult.textContent = `${data.confidence || 0}%`;
        if (cropTypeResult) cropTypeResult.textContent = data.crop_type || 'Unknown';
        
        if (healthStatus) {
            const isHealthy = data.is_healthy;
            healthStatus.textContent = isHealthy ? 'Healthy' : 'Disease Detected';
            healthStatus.className = `health-status ${isHealthy ? 'healthy' : 'diseased'}`;
        }

        if (statusIcon) {
            statusIcon.className = data.is_healthy ? 
                'fas fa-check-circle' : 'fas fa-exclamation-triangle';
        }

        // Animate confidence bar
        if (confidenceBar) {
            setTimeout(() => {
                confidenceBar.style.width = `${data.confidence || 0}%`;
            }, 300);
        }

        // Display processed image from server, fallback to local preview
        if (previewResultImg) {
            if (data.image_url) {
                previewResultImg.src = data.image_url;
            } else if (typeof previewImg !== 'undefined') {
                previewResultImg.src = previewImg.src || '';
            }
        }

        // Update severity indicator based on health and confidence
        const severityFill = document.getElementById('severity-fill');
        const severityText = document.getElementById('severity-text');
        const conf = Number(data.confidence || 0);
        let severityLevel = 'Low';
        let severityPct = 25;
        if (!data.is_healthy) {
            if (conf >= 80) { severityLevel = 'High'; severityPct = 90; }
            else if (conf >= 50) { severityLevel = 'Moderate'; severityPct = 60; }
            else { severityLevel = 'Low'; severityPct = 30; }
        } else {
            severityLevel = 'None';
            severityPct = 0;
        }
        if (severityFill) severityFill.style.width = `${severityPct}%`;
        if (severityText) severityText.textContent = severityLevel;

        // Update recommendations with animations
        const recommendations = document.getElementById('recommendations');
        if (recommendations) {
            const recList = data.is_healthy ? [
                'Continue regular monitoring',
                'Maintain proper irrigation',
                'Ensure adequate nutrients',
                'Practice crop rotation'
            ] : [
                'Isolate affected plants',
                'Consider appropriate treatment',
                'Monitor surrounding plants',
                'Consult local agricultural expert'
            ];

            recommendations.innerHTML = '';
            recList.forEach((rec, index) => {
                const li = document.createElement('li');
                li.innerHTML = `<i class="fas fa-leaf"></i> ${rec}`;
                li.style.animationDelay = `${index * 0.1}s`;
                li.classList.add('fade-in-up');
                recommendations.appendChild(li);
            });
        }
        
        // Store prediction data for report generation
        window.predictionData = data;
        
        // Show success notification
        showNotification('Analysis completed successfully!', 'success');
    }
    
    function generateReport() {
        if (!window.predictionData) return;
        
        const data = window.predictionData;
        const date = new Date().toLocaleDateString();
        
        // Create report content
        const reportContent = `
            <html>
            <head>
                <title>Crop Analysis Report</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .report-section { margin-bottom: 20px; }
                    .result-item { margin: 10px 0; }
                    .healthy { color: green; }
                    .diseased { color: red; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Crop Analysis Report</h1>
                    <p>Generated on ${date}</p>
                </div>
                
                <div class="report-section">
                    <h2>Analysis Results</h2>
                    <div class="result-item">
                        <strong>Crop Type:</strong> ${data.crop_type}
                    </div>
                    <div class="result-item">
                        <strong>Prediction:</strong> ${data.prediction}
                    </div>
                    <div class="result-item">
                        <strong>Confidence:</strong> ${data.confidence}
                    </div>
                    <div class="result-item">
                        <strong>Health Status:</strong> 
                        <span class="${data.is_healthy ? 'healthy' : 'diseased'}">
                            ${data.is_healthy ? 'Healthy' : 'Disease Detected'}
                        </span>
                    </div>
                </div>
                
                <div class="report-section">
                    <h2>${data.is_healthy ? 'Maintenance Recommendations' : 'Treatment Recommendations'}</h2>
                    <ul>
                        ${data.is_healthy ? `
                            <li>Continue regular monitoring</li>
                            <li>Maintain proper irrigation</li>
                            <li>Ensure adequate nutrients</li>
                            <li>Practice crop rotation</li>
                        ` : `
                            <li>Isolate affected plants</li>
                            <li>Consider appropriate treatment</li>
                            <li>Monitor surrounding plants</li>
                            <li>Consult local agricultural expert</li>
                        `}
                    </ul>
                </div>
                
                <div class="footer">
                    <p>CropCare AI - Powered by advanced machine learning</p>
                </div>
            </body>
            </html>
        `;
        
        // Create blob and download
        const blob = new Blob([reportContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `crop-analysis-report-${date}.html`;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
});