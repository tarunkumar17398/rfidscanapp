# PHP Backend Setup Instructions

## 📦 Files to Upload

Upload these folders/files to your hosting at `ckarts.in/rfidscan/`:

```
rfidscan/
├── config.php
├── api/
│   ├── auth.php
│   ├── stats.php
│   ├── import.php
│   ├── scan.php
│   ├── cycle.php
│   ├── scans.php
│   ├── missing.php
│   └── export.php
└── uploads/ (create this folder with write permissions)
```

## 🔧 Configuration Steps

### 1. Create Database
- Go to phpMyAdmin or MySQL command line
- Run the `database.sql` file to create tables

### 2. Generate PIN Hash
Run this PHP code to generate the bcrypt hash for PIN "612302":
```php
<?php
echo password_hash("612302", PASSWORD_BCRYPT);
?>
```

### 3. Update config.php
Edit `config.php` and replace:
- `DB_HOST` - Usually 'localhost'
- `DB_NAME` - 'rfid_inventory'
- `DB_USER` - Your MySQL username
- `DB_PASS` - Your MySQL password
- `PIN_HASH` - Paste the bcrypt hash from step 2

### 4. Set Folder Permissions
```bash
chmod 755 api/
chmod 644 api/*.php
chmod 644 config.php
```

Create uploads folder:
```bash
mkdir uploads
chmod 777 uploads
```

### 5. Test Endpoints

Test authentication:
```bash
curl -X POST https://ckarts.in/rfidscan/api/auth.php \
  -H "Content-Type: application/json" \
  -d '{"pin":"612302"}'
```

Expected response: `{"success":true}`

Test stats:
```bash
curl https://ckarts.in/rfidscan/api/stats.php
```

## 🔒 Security Notes

1. **.htaccess** (Optional - Add to root folder):
```apache
# Prevent directory listing
Options -Indexes

# Protect config.php
<Files "config.php">
    Order Allow,Deny
    Deny from all
</Files>
```

2. **PHP Version**: Requires PHP 7.4 or higher
3. **Extensions Required**: PDO, PDO_MySQL, mbstring, fileinfo

## 📱 RFID Scanner Integration

External RFID scanner should POST to:
```
https://ckarts.in/rfidscan/api/scan.php
```

POST body:
```json
{
  "tagId": "A7B700000000000000023303"
}
```

## 🧪 Quick Test Checklist

- [ ] Database created and tables exist
- [ ] config.php updated with correct credentials
- [ ] PIN login works (test at https://yourapp.lovable.app)
- [ ] Can import CSV files
- [ ] Stats display correctly
- [ ] Scan endpoint receives data
- [ ] Export generates CSV

## 🆘 Troubleshooting

**500 Error**: Check database credentials in config.php

**CORS Error**: Make sure all API files have CORS headers (already included)

**Upload fails**: Check uploads/ folder exists and has write permissions (777)

**Database connection fails**: Verify MySQL service is running and credentials are correct
