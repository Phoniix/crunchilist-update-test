@echo off
rem Updates Crunchilist in this folder to the newest version on GitHub. Your list and settings stay.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\update.ps1" %*
