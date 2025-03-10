class FaceDetector {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.context = this.canvas.getContext('2d');
        this.startButton = document.getElementById('startButton');
        this.stopButton = document.getElementById('stopButton');
        this.errorAlert = document.getElementById('errorAlert');
        this.loading = document.getElementById('loading');
        
        this.stream = null;
        this.isRunning = false;
        this.detectionInterval = null;

        this.bindEvents();
    }

    bindEvents() {
        this.startButton.addEventListener('click', () => this.startCamera());
        this.stopButton.addEventListener('click', () => this.stopCamera());
    }

    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
            
            this.video.srcObject = this.stream;
            this.isRunning = true;
            this.startButton.disabled = true;
            this.stopButton.disabled = false;
            this.errorAlert.classList.add('d-none');
            
            // Set canvas size to match video
            this.video.addEventListener('loadedmetadata', () => {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
            });

            // Start detection loop
            this.startDetection();

        } catch (error) {
            this.showError('Error accessing camera: ' + error.message);
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
            this.stream = null;
        }
        
        this.isRunning = false;
        this.startButton.disabled = false;
        this.stopButton.disabled = true;
        this.clearCanvas();
        
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
        }
    }

    startDetection() {
        this.detectionInterval = setInterval(() => {
            if (this.isRunning) {
                this.detectFaces();
            }
        }, 100);
    }

    async detectFaces() {
        if (!this.isRunning) return;

        try {
            // Draw current video frame to canvas
            this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            
            // Get image data
            const imageData = this.canvas.toDataURL('image/jpeg');
            
            // Send to server for detection
            const response = await fetch('/detect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image: imageData })
            });

            const data = await response.json();
            
            if (data.success) {
                this.drawDetections(data.faces);
            } else {
                console.error('Detection failed:', data.error);
            }

        } catch (error) {
            console.error('Error during detection:', error);
        }
    }

    drawDetections(faces) {
        this.clearCanvas();
        
        this.context.strokeStyle = '#00ff00';
        this.context.lineWidth = 2;
        
        faces.forEach(face => {
            const [x, y, width, height] = face;
            this.context.strokeRect(x, y, width, height);
        });
    }

    clearCanvas() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    showError(message) {
        this.errorAlert.textContent = message;
        this.errorAlert.classList.remove('d-none');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FaceDetector();
});
