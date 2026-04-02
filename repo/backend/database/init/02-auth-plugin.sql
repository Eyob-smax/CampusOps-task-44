-- ============================================================
-- CampusOps — Auth plugin compatibility for dump tooling
-- The backend image uses mariadb-client for backup dumps.
-- Configure the app user to mysql_native_password so mysqldump/mariadb-dump
-- can authenticate against MySQL 8 during local/test Docker runs.
-- ============================================================

ALTER USER IF EXISTS 'campusops'@'%' IDENTIFIED WITH mysql_native_password BY 'campusops_dev';
ALTER USER IF EXISTS 'campusops'@'localhost' IDENTIFIED WITH mysql_native_password BY 'campusops_dev';
FLUSH PRIVILEGES;
