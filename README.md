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

## Maintenance

### Company logo cache cleanup

The dashboard stores resolved company logos in the `CompanyLogo` table as a
persistent, frequency-aware cache (Layer 2; Layer 1 is the Django cache).
To keep the store fast, evict rows that are **both** old (not requested
within the last 60 days) **and** rarely used (fewer than 5 hits) — frequently
used logos are always kept:

```bash
python manage.py cleanup_company_logos
```

Run it on a schedule (e.g. daily at 03:00) via cron or a Render Cron Job:

```cron
0 3 * * * cd /path/to/project && /path/to/venv/bin/python manage.py cleanup_company_logos
```

## License

MIT License
