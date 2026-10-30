# build-apk.ps1 —— 用本机 Android SDK 手工构建 APK（不依赖 Gradle / 网络）
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sdk  = 'C:\AndroidBuild\android-sdk'
$jdk  = 'C:\AndroidBuild\jdk21'
$bt   = Join-Path $sdk 'build-tools\35.0.0'
$androidJar = Join-Path $sdk 'platforms\android-35\android.jar'
$out  = Join-Path $root 'dist\apk'
$work = Join-Path $root 'build\apk'

Write-Host '== 清理 =='
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $work, "$work\gen", "$work\classes", "$work\dex", "$work\res", "$work\assets", $out | Out-Null

Write-Host '== 拷贝资源 =='
Copy-Item (Join-Path $root 'dist\麻将赛事管理.html') "$work\assets\index.html" -Force
Copy-Item (Join-Path $root 'android\res\values\strings.xml') "$work\res\strings.xml" -Force

Write-Host '== aapt2 compile =='
& "$bt\aapt2.exe" compile --dir "$work\res" -o "$work\res.zip"
if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile failed' }

Write-Host '== aapt2 link =='
& "$bt\aapt2.exe" link -o "$work\base.apk" -I $androidJar `
    --manifest "$root\android\AndroidManifest.xml" `
    -A "$work\assets" --java "$work\gen" --auto-add-overlay "$work\res.zip"
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link failed' }

Write-Host '== javac =='
$javaFiles = Get-ChildItem (Join-Path $root 'android\java') -Recurse -Filter *.java | ForEach-Object { $_.FullName }
$genFiles  = Get-ChildItem "$work\gen" -Recurse -Filter *.java -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
& "$jdk\bin\javac.exe" -encoding UTF-8 -source 8 -target 8 -nowarn -cp $androidJar -d "$work\classes" @($javaFiles + $genFiles) 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }

Write-Host '== d8 =='
$classFiles = Get-ChildItem "$work\classes" -Recurse -Filter *.class | ForEach-Object { $_.FullName }
& "$bt\d8.bat" --release --lib $androidJar --min-api 24 --output "$work\dex" @classFiles 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw 'd8 failed' }

Write-Host '== 打包 dex =='
& "$jdk\bin\jar.exe" --update --file "$work\base.apk" -C "$work\dex" classes.dex 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw 'jar update failed' }

Write-Host '== zipalign =='
& "$bt\zipalign.exe" -f 4 "$work\base.apk" "$work\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

Write-Host '== 签名 =='
$ks = Join-Path $root 'android\mtt.keystore'
if (-not (Test-Path $ks)) {
    & "$jdk\bin\keytool.exe" -genkeypair -keystore $ks -alias mtt -keyalg RSA -keysize 2048 `
        -validity 10000 -storepass mtt12345 -keypass mtt12345 `
        -dname "CN=Mahjong Tournament, O=Local, C=CN" -noprompt 2>&1 | Out-String
}
$apk = Join-Path $out '麻将赛事管理.apk'
& "$bt\apksigner.bat" sign --ks $ks --ks-pass pass:mtt12345 --key-pass pass:mtt12345 --out $apk "$work\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'apksigner failed' }
& "$bt\apksigner.bat" verify --verbose $apk

Write-Host ("完成: " + $apk + "  " + [math]::Round((Get-Item $apk).Length / 1MB, 2) + " MB")
