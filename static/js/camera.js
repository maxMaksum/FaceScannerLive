class FaceDetector {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.context = this.canvas.getContext('2d');
        this.startButton = document.getElementById('startButton');
        this.stopButton = document.getElementById('stopButton');
        this.screenshotButton = document.getElementById('screenshotButton');
        this.enrollButton = document.getElementById('enrollButton');
        this.recognizeButton = document.getElementById('recognizeButton');
        this.errorAlert = document.getElementById('errorAlert');
        this.loading = document.getElementById('loading');

        // Enrollment modal elements
        this.enrollModal = new bootstrap.Modal(document.getElementById('enrollModal'));
        this.enrollName = document.getElementById('enrollName');
        this.enrollImage = document.getElementById('enrollImage');
        this.saveEnrollButton = document.getElementById('saveEnrollButton');

        this.stream = null;
        this.isRunning = false;
        this.detectionInterval = null;
        this.lastDetectedFaces = [];
        this.isRecognitionMode = false;
        this.capturedImageData = null;

        this.bindEvents();
    }

    bindEvents() {
        this.startButton.addEventListener('click', () => this.startCamera());
        this.stopButton.addEventListener('click', () => this.stopCamera());
        this.screenshotButton.addEventListener('click', () => this.logFaceScreenshot());
        this.enrollButton.addEventListener('click', () => this.showEnrollModal());
        this.recognizeButton.addEventListener('click', () => this.toggleRecognition());
        this.saveEnrollButton.addEventListener('click', () => this.enrollFace());
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
            this.screenshotButton.disabled = false;
            this.enrollButton.disabled = false;
            this.recognizeButton.disabled = false;
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
        this.screenshotButton.disabled = true;
        this.enrollButton.disabled = true;
        this.recognizeButton.disabled = true;
        this.clearCanvas();

        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
        }
    }

    logFaceScreenshot() {
        if (!this.isRunning || this.lastDetectedFaces.length === 0) {
            console.log('No faces detected to capture');
            return;
        }

        // Get the current frame
        this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        const imageData = this.canvas.toDataURL('image/jpeg');

        console.log('Face Screenshot Base64 Encoding:');
        console.log(imageData);
    }

    startDetection() {
        this.detectionInterval = setInterval(() => {
            if (this.isRunning) {
                if (this.isRecognitionMode) {
                    this.recognizeFaces();
                } else {
                    this.detectFaces();
                }
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
                this.lastDetectedFaces = data.faces;
                this.drawDetections(data.faces);
            } else {
                console.error('Detection failed:', data.error);
            }

        } catch (error) {
            console.error('Error during detection:', error);
        }
    }

    async recognizeFaces() {
        if (!this.isRunning) return;

        try {
            // Draw current video frame to canvas
            this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

            // Get image data
            const imageData = this.canvas.toDataURL('image/jpeg');

            // Send to server for recognition
            const response = await fetch('/recognize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image: imageData })
            });

            const data = await response.json();

            if (data.success) {
                this.drawRecognizedFaces(data.faces);
            } else {
                console.error('Recognition failed:', data.error);
            }

        } catch (error) {
            console.error('Error during recognition:', error);
        }
    }

    toggleRecognition() {
        this.isRecognitionMode = !this.isRecognitionMode;
        this.recognizeButton.textContent = this.isRecognitionMode ? 'Toggle Detection' : 'Toggle Recognition';
        this.clearCanvas();
    }

    showEnrollModal() {
        this.captureCurrentFrame();
        this.enrollModal.show();
    }

    captureCurrentFrame() {
        this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        this.capturedImageData = this.canvas.toDataURL('image/jpeg');
        this.enrollImage.src = this.capturedImageData;
        this.enrollImage.classList.remove('d-none');
    }

    async enrollFace() {
        const name = this.enrollName.value.trim();
        if (!name) {
            this.showError('Please enter a name');
            return;
        }

        try {
            const response = await fetch('/enroll', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name,
                    image: this.capturedImageData
                })
            });

            const data = await response.json();

            if (data.success) {
                this.enrollModal.hide();
                this.enrollName.value = '';
                this.enrollImage.classList.add('d-none');
                alert('Face enrolled successfully!');
            } else {
                this.showError(data.error);
            }

        } catch (error) {
            this.showError('Error enrolling face: ' + error.message);
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

    drawRecognizedFaces(faces) {
        this.clearCanvas();

        this.context.strokeStyle = '#00ff00';
        this.context.lineWidth = 2;
        this.context.font = '16px Arial';
        this.context.fillStyle = '#00ff00';

        faces.forEach(face => {
            const [top, right, bottom, left] = face.location;
            const width = right - left;
            const height = bottom - top;

            // Draw rectangle
            this.context.strokeRect(left, top, width, height);

            // Draw name
            this.context.fillText(face.name, left, top - 5);
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