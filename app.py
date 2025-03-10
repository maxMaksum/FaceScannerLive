import os
import cv2
import numpy as np
import base64
from flask import Flask, render_template, Response, jsonify, request
import logging
from extensions import db
from models import FaceEncoding

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET")

# Configure SQLite database
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///faces.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# Initialize face detection classifier
logger.info("Initializing face detection and recognition...")
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
recognizer = cv2.face.LBPHFaceRecognizer_create()

@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')

@app.route('/detect', methods=['POST'])
def detect_faces():
    """Process image from client and detect faces"""
    try:
        # Get image data from request
        image_data = request.json['image']

        # Convert base64 image to numpy array
        encoded_data = image_data.split(',')[1]
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # Convert to grayscale for face detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Detect faces
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30)
        )

        # Convert faces to list format
        faces_list = []
        for face in faces:
            # Convert numpy int32 values to native Python integers
            faces_list.append([int(x) for x in face])

        # Return face coordinates
        return jsonify({
            'success': True,
            'faces': faces_list
        })

    except Exception as e:
        logger.error(f"Error during face detection: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/enroll', methods=['POST'])
def enroll_face():
    """Enroll a new face with a name"""
    try:
        data = request.json
        name = data.get('name')
        image_data = data.get('image')

        if not name or not image_data:
            return jsonify({'success': False, 'error': 'Name and image are required'}), 400

        # Convert base64 image to numpy array
        encoded_data = image_data.split(',')[1]
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Detect face
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))

        if len(faces) == 0:
            return jsonify({'success': False, 'error': 'No face found in image'}), 400

        # Get the first face
        (x, y, w, h) = faces[0]
        face_roi = gray[y:y+h, x:x+w]

        # Resize to a standard size
        face_roi = cv2.resize(face_roi, (100, 100))

        # Store in database
        new_face = FaceEncoding(name=name)
        new_face.set_encoding(face_roi)
        db.session.add(new_face)
        db.session.commit()

        # Retrain recognizer with all faces
        train_recognizer()

        return jsonify({'success': True, 'message': f'Face enrolled for {name}'})

    except Exception as e:
        logger.error(f"Error during face enrollment: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

def train_recognizer():
    """Train the recognizer with all stored faces"""
    try:
        faces = FaceEncoding.query.all()
        if not faces:
            logger.warning("No faces available for training")
            return

        face_data = []
        labels = []
        for idx, face in enumerate(faces):
            face_array = face.get_encoding()
            face_data.append(face_array.reshape(100, 100))
            labels.append(idx)

        logger.info(f"Training recognizer with {len(faces)} faces")
        recognizer.train(face_data, np.array(labels))
        logger.info("Training completed successfully")

    except Exception as e:
        logger.error(f"Error during recognizer training: {str(e)}")
        raise

@app.route('/recognize', methods=['POST'])
def recognize_face():
    """Recognize faces in the image"""
    try:
        image_data = request.json['image']

        # Convert base64 image to numpy array
        encoded_data = image_data.split(',')[1]
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Detect faces
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))

        if len(faces) == 0:
            return jsonify({'success': True, 'faces': []})

        # Get all known faces
        known_faces = FaceEncoding.query.all()
        if not known_faces:
            # Convert numpy int32 values to native Python integers
            return jsonify({
                'success': True,
                'faces': [{
                    'location': [int(y), int(x + w), int(y + h), int(x)],
                    'name': 'Unknown'
                } for (x, y, w, h) in faces]
            })

        recognized_faces = []
        for (x, y, w, h) in faces:
            face_roi = gray[y:y+h, x:x+w]
            face_roi = cv2.resize(face_roi, (100, 100))

            try:
                label, confidence = recognizer.predict(face_roi)
                # Convert numpy int32/float32 values to native Python types
                label = int(label)
                confidence = float(confidence)
                name = known_faces[label].name if confidence < 100 else "Unknown"

                recognized_faces.append({
                    'location': [int(y), int(x + w), int(y + h), int(x)],  # Convert to native Python integers
                    'name': name
                })
            except Exception as e:
                logger.error(f"Error during recognition of individual face: {str(e)}")
                recognized_faces.append({
                    'location': [int(y), int(x + w), int(y + h), int(x)],
                    'name': "Unknown"
                })

        return jsonify({'success': True, 'faces': recognized_faces})

    except Exception as e:
        logger.error(f"Error during face recognition: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

# Create database tables
with app.app_context():
    db.create_all()
    logger.info("Database tables created successfully")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)