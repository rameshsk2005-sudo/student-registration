// =========================
// app.js
// =========================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const Student = require('./models/Student');
const { body, validationResult } = require('express-validator');
const morgan = require('morgan');
const bcrypt = require('bcrypt');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const SALT_ROUNDS = 10;

// -------------------------
// STATIC COURSE LIST
// -------------------------
const COURSES = [
  { id: 'cloud-fund', name: 'Cloud Computing Fundamentals' },
  { id: 'cloud-deploy', name: 'Advanced Cloud Deployment' },
  { id: 'cloud-sec', name: 'Cloud Security Management' },
  { id: 'devops-cloud', name: 'DevOps & Cloud Automation' },
  { id: 'mongo-db', name: 'Database Management with MongoDB' }
];

// -------------------------
// MongoDB Connection
// -------------------------
mongoose
  .connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// -------------------------
// View Engine + Layouts
// -------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// -------------------------
// Middleware
// -------------------------
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(morgan('dev'));

// -------------------------
// Session
// -------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
  })
);

// Make logged user visible in EJS
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// -------------------------
// Helper
// -------------------------
function ensureLoggedIn(req, res, next) {
  if (req.session?.user?._id) return next();
  return res.redirect('/login');
}

// ===================================================
// ROUTES
// ===================================================

// HOME → redirects to signup
app.get('/', (req, res) => {
  res.redirect('/signup');
});

// SIGNUP PAGE
app.get('/signup', (req, res) => {
  res.render('signup', { errors: [], form: {} });
});

// SIGNUP POST
app.post(
  '/signup',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('srn').notEmpty().withMessage('SRN is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    const form = req.body;

    if (!errors.isEmpty()) {
      return res.render('signup', { errors: errors.array(), form });
    }

    try {
      const email = form.email.toLowerCase().trim();
      const srn = form.srn.toUpperCase().trim();

      const exists = await Student.findOne({ $or: [{ email }, { srn }] });
      if (exists) {
        const msg = exists.email === email ? 'Email already registered' : 'SRN already registered';
        return res.render('signup', { errors: [{ msg }], form });
      }

      const hash = await bcrypt.hash(form.password, SALT_ROUNDS);

      const student = new Student({
        name: form.name.trim(),
        email,
        srn,
        passwordHash: hash,
        registeredCourses: []
      });

      await student.save();

      req.session.user = {
        _id: student._id,
        name: student.name,
        email: student.email,
        srn: student.srn
      };

      return res.redirect('/courses');
    } catch (err) {
      console.error(err);
      return res.render('signup', { errors: [{ msg: 'Server error' }], form });
    }
  }
);

// LOGIN PAGE
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// LOGIN POST
app.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.render('login', { error: errors.array()[0].msg });

    const { email, password } = req.body;

    try {
      const student = await Student.findOne({ email: email.toLowerCase() });
      if (!student) return res.render('login', { error: 'Invalid email or password' });

      const ok = await bcrypt.compare(password, student.passwordHash);
      if (!ok) return res.render('login', { error: 'Invalid email or password' });

      req.session.user = {
        _id: student._id,
        name: student.name,
        email: student.email,
        srn: student.srn
      };

      return res.redirect('/courses');
    } catch (err) {
      console.error(err);
      res.render('login', { error: 'Server error' });
    }
  }
);

// LOGOUT
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// AVAILABLE COURSES
app.get('/courses', ensureLoggedIn, async (req, res) => {
  const student = await Student.findById(req.session.user._id).lean();
  const registeredIds = student.registeredCourses.map(c => c.id);

  const availableCourses = COURSES.filter(c => !registeredIds.includes(c.id));

  res.render('courses', {
    courses: availableCourses,
    registered: student.registeredCourses
  });
});

// REGISTER FOR A COURSE
app.post('/courses/:id/register', ensureLoggedIn, async (req, res) => {
  const courseId = req.params.id;
  const course = COURSES.find(c => c.id === courseId);

  if (!course) return res.status(400).send('Invalid course');

  try {
    const student = await Student.findById(req.session.user._id);

    if (student.registeredCourses.some(c => c.id === courseId)) {
      return res.redirect('/my-courses');
    }

    student.registeredCourses.push({ id: course.id, name: course.name });
    await student.save();

    res.redirect('/my-courses');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ==========================
// MY COURSES
// ==========================
app.get('/my-courses', ensureLoggedIn, async (req, res) => {
  const student = await Student.findById(req.session.user._id).lean();
  res.render('mycourses', { registered: student.registeredCourses });
});

// ==========================
// REGISTERED STUDENTS PAGE (✔ FIXED)
// ==========================
app.get('/students', async (req, res) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 }).lean();
    res.render('students', { students });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// 404
app.use((req, res) => {
  res.status(404).send('404 - Not Found');
});

// START SERVER
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
