@echo off
title Aerials - Phone Server
rem Serves the game on your Wi-Fi so a phone on the same network can play it in its browser.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed, so the Wi-Fi server cannot start.
  echo Use Build_Phone_File.bat instead and copy WWII_Air_Combat_Phone.html to your phone.
  pause
  exit /b 1
)
node "%~dp0tools\phone_server.js" 8080
pause
