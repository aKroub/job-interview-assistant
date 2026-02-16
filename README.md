# Interview Prep Tracker

A full-featured interview preparation and job application tracking tool built with React. Track your application pipeline, schedule interviews, and access curated system design practice questions from top tech companies.

## Features

### 🎯 Pipeline Management (Kanban Board)
- Visual kanban board to track companies through your interview pipeline
- Six stages: Interested → Applied → Phone Screen → Technical → Final Round → Offer
- Quick stage updates via dropdown
- Track position titles and company names
- Easy company deletion

### 📅 Interview Timeline
- Schedule and track all your interviews in one place
- Add interviews with type, date, time, and status
- Visual timeline sorted by date
- Status tracking: Scheduled, Completed, Cancelled
- See all interviews across all companies in chronological order

### 📚 Interview Prep Content
- Curated system design questions from Google, Microsoft, and Facebook
- Each company shows 3 fresh questions at a time
- Direct links to YouTube video solutions
- Mark questions as "seen" to get new recommendations
- Progress tracking showing completed questions per company
- Difficulty levels for each question (Easy, Medium, Hard)
- Reset options when you've completed all questions

### 💾 Persistent Storage
- All data persists between sessions using browser storage
- Tracks companies, interviews, and seen questions
- No account required - works entirely in your browser

## Tech Stack

- **React** - UI framework with hooks
- **Lucide React** - Beautiful icon library
- **Tailwind CSS** - Utility-first styling
- **Browser Storage API** - Persistent data storage

## Getting Started

### Prerequisites
- Node.js 14+ and npm/yarn installed
- Modern web browser

### Installation

1. **Clone/Download the repository**
   ```bash
   mkdir interview-prep-tracker
   cd interview-prep-tracker
   ```

2. **Create a new React app**
   ```bash
   npx create-react-app .
   ```

3. **Install dependencies**
   ```bash
   npm install lucide-react
   ```

4. **Replace `src/App.js` with the tracker code**
   - Copy the contents of `interview-prep-tracker.jsx` into `src/App.js`

5. **Update `src/index.css` to include Tailwind**
   ```css
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```

6. **Install Tailwind CSS**
   ```bash
   npm install -D tailwindcss postcss autoprefixer
   npx tailwindcss init -p
   ```

7. **Configure Tailwind** - Update `tailwind.config.js`:
   ```javascript
   module.exports = {
     content: [
       "./src/**/*.{js,jsx,ts,tsx}",
     ],
     theme: {
       extend: {},
     },
     plugins: [],
   }
   ```

8. **Run the app**
   ```bash
   npm start
   ```

The app will open at `http://localhost:3000`

## Usage Guide

### Adding Companies
1. Navigate to the "Pipeline" tab
2. Click "Add Company" button
3. Enter company name, position, and initial stage
4. Click "Add Company" to save

### Managing Pipeline
- Drag and drop companies between stages using the dropdown
- Click the X icon to remove a company
- View interview count badge on each company card

### Scheduling Interviews
1. Go to the "Timeline" tab
2. Find the company you want to schedule an interview for
3. Click "Add Interview"
4. Enter interview type (e.g., "Technical Round"), date, and time
5. Click "Add" to save
6. Update status as interviews progress

### Practicing System Design
1. Navigate to the "Prep Content" tab
2. Browse questions from Google, Microsoft, and Facebook
3. Click "Watch" to view the YouTube solution video
4. Click "Mark Seen" once you've completed a question
5. New questions automatically appear as you mark others seen
6. Reset all questions for a company if needed

## Project Structure

```
interview-prep-tracker/
├── src/
│   ├── App.js                 # Main application component
│   ├── index.css              # Tailwind styles
│   └── index.js               # React entry point
├── public/
│   └── index.html
├── package.json
├── tailwind.config.js
└── README.md
```

## Data Storage

The app uses browser's persistent storage API to save:
- **companies**: Array of company objects with stages and interviews
- **seenQuestions**: Set of question IDs you've completed

Data persists between browser sessions but is tied to your browser. Clear your browser data to reset.

## Customization

### Adding More Questions
Edit the `SYSTEM_DESIGN_QUESTIONS` object in the code to add more companies or questions:

```javascript
const SYSTEM_DESIGN_QUESTIONS = {
  YourCompany: [
    { 
      id: 'unique-id', 
      title: 'Design Something', 
      url: 'https://youtube.com/...', 
      difficulty: 'Medium' 
    },
  ],
};
```

### Changing Pipeline Stages
Modify the `stages` and `stageLabels` arrays to customize your pipeline stages.

## Git Setup

To initialize this as a Git repository:

```bash
# Initialize git
git init

# Create .gitignore
cat > .gitignore << EOL
# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# production
/build

# misc
.DS_Store
.env.local
.env.development.local
.env.test.local
.env.production.local

npm-debug.log*
yarn-debug.log*
yarn-error.log*
EOL

# Create initial commit
git add .
git commit -m "Initial commit: Interview Prep Tracker"

# Create GitHub repo and push
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## Contributing

This is a personal project, but feel free to fork and customize for your own needs!

## Future Enhancements

Ideas for future development:
- [ ] Add notes section per company
- [ ] Export data as JSON/CSV
- [ ] Email reminders for upcoming interviews
- [ ] More interview question categories (behavioral, coding, etc.)
- [ ] Dark mode
- [ ] Mobile responsive improvements
- [ ] Integration with calendar apps
- [ ] Salary negotiation tracker

## License

MIT License - feel free to use this for your job search!

## Support

For issues or questions, open an issue on GitHub or reach out directly.

---

**Good luck with your interviews! 🚀**
