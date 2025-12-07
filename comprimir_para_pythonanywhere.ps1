# Script para comprimir la carpeta main y prepararla para PythonAnywhere
# Ejecutar desde: d:\logix_ApiRouter\

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Preparando proyecto para PythonAnywhere" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que existe la carpeta main
if (-not (Test-Path "main")) {
    Write-Host "ERROR: No se encontro la carpeta 'main'" -ForegroundColor Red
    Write-Host "Ejecuta este script desde d:\logix_ApiRouter\" -ForegroundColor Yellow
    exit 1
}

# Nombre del archivo ZIP
$zipFile = "logix_pythonanywhere.zip"

# Eliminar ZIP anterior si existe
if (Test-Path $zipFile) {
    Write-Host "Eliminando archivo ZIP anterior..." -ForegroundColor Yellow
    Remove-Item $zipFile -Force
}

# Comprimir carpeta main
Write-Host "Comprimiendo carpeta 'main'..." -ForegroundColor Green
try {
    Compress-Archive -Path "main\*" -DestinationPath $zipFile -CompressionLevel Optimal -Force
    Write-Host "Compresion completada exitosamente" -ForegroundColor Green
}
catch {
    Write-Host "ERROR al comprimir: $_" -ForegroundColor Red
    exit 1
}

# Mostrar informacion del archivo
$zipInfo = Get-Item $zipFile
$sizeMB = [math]::Round($zipInfo.Length / 1MB, 2)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Archivo creado exitosamente" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Archivo: $zipFile" -ForegroundColor White
Write-Host "Tamano: $sizeMB MB" -ForegroundColor White
Write-Host "Ubicacion: $($zipInfo.FullName)" -ForegroundColor White
Write-Host ""

# Instrucciones
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Proximos pasos:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Sube el archivo '$zipFile' a PythonAnywhere:" -ForegroundColor Yellow
Write-Host "   - Ir a Files y Upload a file" -ForegroundColor Gray
Write-Host ""
Write-Host "2. En Bash console de PythonAnywhere:" -ForegroundColor Yellow
Write-Host "   cd ~" -ForegroundColor Gray
Write-Host "   unzip $zipFile -d logix_ApiRouter" -ForegroundColor Gray
Write-Host "   cd logix_ApiRouter" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Continua con las instrucciones en DEPLOY.md" -ForegroundColor Yellow
Write-Host ""
