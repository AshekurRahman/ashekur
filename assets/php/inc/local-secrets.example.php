<?php
/* Template for server-only secrets that must never enter git history.
   On the live server: copy this file to local-secrets.php (same
   directory) via FTP or the cPanel File Manager — never via git — and
   fill in the real value(s) below. local-secrets.php is listed in
   .gitignore, so it stays out of every commit and every pull deploy.

   malware-checker.php includes local-secrets.php automatically if it
   exists, before reading GOOGLE_SAFE_BROWSING_API_KEY via getenv(). If
   the file is absent (as it is by default, including right after a
   fresh git deploy), the Safe Browsing check just reports itself as
   not configured — nothing else breaks. */

putenv('GOOGLE_SAFE_BROWSING_API_KEY=paste-the-real-key-here');
