@echo off
chcp 65001 >nul
title FURQON Online - ornatish
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (echo.& echo Xatolik yuz berdi. & pause)
