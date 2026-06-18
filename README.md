# Prof - Django Project

A clean and professional Django project named "Prof".

## Project Structure

```
Prof/
├── venv/                # Python virtual environment
├── prof/               # Project configuration
├── apps/               # Custom Django apps
│   └── core/          # Core application
├── static/            # Static files (CSS, JS, images)
│   ├── css/
│   ├── js/
│   └── images/
├── media/             # User-uploaded files
│   └── uploads/
├── requirements.txt
├── .gitignore
└── manage.py
```

## Installation

### Prerequisites

- Python 3.10 or higher
- pip (Python package manager)

### Setup Instructions

1. **Clone or navigate to the project directory**
   ```bash
   cd d:/Aria/Prof
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   ```

3. **Activate virtual environment**
   - Windows (PowerShell):
     ```powershell
     venv\Scripts\Activate.ps1
     ```
   - Windows (CMD):
     ```cmd
     venv\Scripts\activate
     ```

4. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

5. **Run migrations**
   ```bash
   python manage.py migrate
   ```

6. **Create superuser (optional)**
   ```bash
   python manage.py createsuperuser
   ```

7. **Run development server**
   ```bash
   python manage.py runserver
   ```

## Configuration

The project is configured for development by default. Key settings:

- Debug mode enabled
- Local SQLite database
- Static files in `static/` directory
- Media files in `media/` directory

## Apps

- **core**: Core application with base functionality

## License

MIT License
