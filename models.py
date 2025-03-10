from extensions import db
import numpy as np
import json

class FaceEncoding(db.Model):
    __tablename__ = 'face_encodings'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    encoding = db.Column(db.Text, nullable=False)  # Store face data as JSON string
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    def set_encoding(self, encoding_array):
        """Convert numpy array to JSON string for storage"""
        # Ensure the array is 1D for storage
        flattened = encoding_array.flatten() if isinstance(encoding_array, np.ndarray) else encoding_array
        self.encoding = json.dumps(flattened.tolist())

    def get_encoding(self):
        """Convert stored JSON string back to numpy array"""
        data = json.loads(self.encoding)
        return np.array(data, dtype=np.float32)