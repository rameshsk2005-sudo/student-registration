// models/Student.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  course: { type: String, trim: true }, // optional field used previously
  srn: { type: String, required: true, trim: true, uppercase: true, unique: true },
  passwordHash: { type: String, required: true },
  registeredCourses: [
    {
      id: { type: String },
      name: { type: String },
      registeredAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

// ensure indexes
studentSchema.index({ email: 1 }, { unique: true });
studentSchema.index({ srn: 1 }, { unique: true });

module.exports = mongoose.model('Student', studentSchema);
