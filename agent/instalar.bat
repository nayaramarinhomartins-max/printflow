@echo off
echo Instalando Gestao Grafica Agent...
python -m pip install --upgrade pip
pip install -r requirements.txt
echo.
echo Instalacao concluida. Execute iniciar.bat para iniciar o agente Gestao Grafica.
pause
