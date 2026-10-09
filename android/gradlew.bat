@rem Gradle startup script for Windows (generated equivalent for VetCura).
@if "%DEBUG%"=="" @echo off
@rem Set local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" setlocal

set DIRNAME=%~dp0
if "%DIRNAME%"=="" set DIRNAME=.
@rem This is normally unused
set APP_BASE_NAME=%~n0
set APP_HOME=%DIRNAME%

@rem Execute Gradle
"%JAVA_HOME%\bin\java.exe" "-Xmx64m" "-Xms64m" -classpath "%APP_HOME%\gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*

:end
@rem End local scope for the variables with windows NT shell
if %ERRORLEVEL% equ 0 exit /b 0
exit /b %ERRORLEVEL%
