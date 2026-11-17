param (
    [string]$DocxPath
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path $DocxPath)) {
    Write-Error "File not found: $DocxPath"
    exit 1
}

try {
    # Open file with FileShare.ReadWrite to prevent locking conflicts
    $fileStream = [System.IO.File]::Open($DocxPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $zip = New-Object System.IO.Compression.ZipArchive($fileStream, [System.IO.Compression.ZipArchiveMode]::Read)
    
    Write-Host "=== Inspecting: $DocxPath ==="
    Write-Host "Total ZIP Entries: $($zip.Entries.Count)"
    
    $docEntry = $zip.GetEntry("word/document.xml")
    if (-not $docEntry) {
        Write-Error "word/document.xml not found! File is not a valid DOCX document."
        $zip.Dispose()
        $fileStream.Close()
        exit 1
    }

    $stream = $docEntry.Open()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
    $xml = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
    $zip.Dispose()
    $fileStream.Close()

    Write-Host "word/document.xml character count: $($xml.Length)"
    
    # Strip XML tags to get raw text
    $text = [System.Text.RegularExpressions.Regex]::Replace($xml, "<[^>]+>", " ")
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, "\s+", " ")
    
    Write-Host "Text character count: $($text.Length)"
    Write-Host ""
    Write-Host "--- Text Preview (first 1000 characters) ---"
    Write-Host $text.Substring(0, [Math]::Min(1000, $text.Length))
    Write-Host "--------------------------------------------"
    
    return $text
} catch {
    Write-Error "Failed to parse DOCX: $_"
    exit 1
}
