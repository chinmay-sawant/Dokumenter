@echo off
echo Packaging extension...
call npx @vscode/vsce package

echo Finding .vsix file...
for %%f in (*.vsix) do (
    echo Installing extension: %%f
    code --install-extension "%%f" --force
    echo Cleaning up...
    del "%%f"
    echo Extension installed successfully!
    goto :end
)

echo No .vsix file found!
:end
pause
