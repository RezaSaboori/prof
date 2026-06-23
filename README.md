## Installation

### Prerequisites

- Python 3.10 or higher
- pip (Python package manager)

### Setup Instructions

1. **Clone or navigate to the project directory**


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

6. **Run development server**
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
