# Contributing to PropReel

Thank you for your interest in contributing to PropReel! This document provides guidelines and information for contributors.

---

## 🚀 Getting Started

### Development Setup

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub
   ```

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/propreel.git
   cd propreel
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

---

## 📋 Development Workflow

### 1. Create a Branch

```bash
# For new features
git checkout -b feature/your-feature-name

# For bug fixes
git checkout -b bugfix/issue-description

# For hotfixes
git checkout -b hotfix/critical-fix
```

### 2. Make Changes

- Follow the existing code style
- Write clear, concise commit messages
- Test your changes locally
- Update documentation if needed

### 3. Test Your Changes

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### 4. Commit Changes

```bash
git add .
git commit -m "Description of changes"
```

**Commit Message Format:**
```
type: description

Examples:
feat: add video generation feature
fix: resolve credit calculation bug
docs: update deployment guide
style: format code with prettier
refactor: simplify authentication logic
test: add unit tests for credit system
chore: update dependencies
```

### 5. Push to GitHub

```bash
git push origin your-branch-name
```

### 6. Create Pull Request

1. Go to your fork on GitHub
2. Click "Compare & pull request"
3. Add detailed description
4. Link related issues
5. Request review from maintainers

---

## 🎯 Code Standards

### TypeScript

- Use TypeScript for all new files
- Define proper types and interfaces
- Avoid `any` type when possible
- Use meaningful variable names

### React

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use proper prop types

### Styling

- Use Tailwind CSS classes
- Follow the existing design system
- Maintain responsive design
- Test on mobile devices

### File Organization

```
src/
├── components/     # Reusable components
├── pages/         # Page components
├── context/       # React context
├── lib/           # Utilities
└── types/         # TypeScript types
```

---

## 🧪 Testing

### Before Submitting PR

- [ ] Code builds without errors
- [ ] All features work as expected
- [ ] No console errors
- [ ] Responsive on mobile
- [ ] Accessibility standards met
- [ ] Documentation updated

### Manual Testing Checklist

- User registration and login
- Credit system functionality
- Video generation
- Payment flow
- Admin features
- All legal pages
- Tutorial system

---

## 📝 Documentation

### When to Update Docs

- New features added
- API changes
- Configuration changes
- Deployment process changes
- Bug fixes with workarounds

### Documentation Files

- `README.md` - Project overview
- `GITHUB_VERCEL_DEPLOYMENT.md` - Deployment guide
- `DEPLOYMENT_GUIDE.md` - Detailed deployment
- `MODAL_ENDPOINT_SETUP.md` - Modal setup
- `TESTING_RESULTS.md` - Test results

---

## 🔄 Pull Request Process

### PR Requirements

1. **Title**: Clear and descriptive
2. **Description**: 
   - What changed and why
   - How to test
   - Screenshots (if UI changes)
   - Related issues
3. **Tests**: Manual testing completed
4. **Documentation**: Updated if needed
5. **Breaking Changes**: Clearly marked

### Review Process

1. Maintainer reviews the PR
2. Feedback provided if needed
3. Changes requested or approved
4. Merge to main after approval
5. Automatic deployment to production

---

## 🐛 Reporting Issues

### Bug Reports

Use GitHub Issues with this template:

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
 - OS: [e.g. Windows, macOS]
 - Browser: [e.g. Chrome, Safari]
 - Version: [e.g. 22]

**Additional context**
Add any other context about the problem.
```

### Feature Requests

Use GitHub Issues with this template:

```markdown
**Is your feature request related to a problem?**
A clear description of what the problem is.

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
A clear description of alternative solutions.

**Additional context**
Add any other context or screenshots about the feature request.
```

---

## 🔐 Security

### Never Commit

- `.env` files with real credentials
- API keys or secrets
- Database credentials
- Private keys or certificates

### Use `.gitignore`

The following are already excluded:
- `node_modules/`
- `.env`
- `deploy/credentials/`
- `dist/`
- `*.log`

### Report Security Issues

For security vulnerabilities, email: security@propreel.co.za

**Do not** create public GitHub issues for security vulnerabilities.

---

## 📦 Dependencies

### Adding Dependencies

```bash
# Production dependencies
npm install package-name

# Development dependencies
npm install --save-dev package-name
```

### Updating Dependencies

```bash
# Check for outdated packages
npm outdated

# Update packages
npm update

# Review changes before committing
git diff package.json
```

---

## 🎨 Design Guidelines

### Colors

- Primary: Purple (#800080)
- Secondary: Blue (#3b82f6)
- Success: Green (#22c55e)
- Warning: Yellow (#f59e0b)
- Danger: Red (#ef4444)

### Typography

- Font Family: Inter, system-ui, sans-serif
- Headings: Bold, larger sizes
- Body: Regular, readable sizes
- Code: Monospace fonts

### Components

- Use existing UI components when possible
- Follow the design system
- Maintain consistency
- Test on all screen sizes

---

## 🚀 Deployment

### Automatic Deployment

- Push to `main` → Production deployment
- Pull requests → Preview deployments
- Other branches → Preview deployments

### Manual Deployment

```bash
# Build
npm run build

# Deploy to Vercel
vercel --prod
```

---

## 📞 Getting Help

### Resources

- **Documentation**: See README and docs/ folder
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Email**: support@propreel.co.za

### Community

- Be respectful and inclusive
- Help others when you can
- Share knowledge
- Celebrate contributions

---

## 🎉 Recognition

Contributors will be:

- Listed in the README
- Mentioned in release notes
- Credited in commit history
- Thanked in project documentation

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the project's license.

---

**Thank you for contributing to PropReel! 🚀**
