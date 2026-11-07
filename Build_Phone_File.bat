@echo off
title Build phone version
rem Packs the whole game into WWII_Air_Combat_Phone.html - copy that one file to your phone.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\build_phone_file.ps1"
pause
