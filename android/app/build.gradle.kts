plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.vetcura.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.vetcura.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        // Emulator default: http://10.0.2.2:3001. Physical device on the
        // same Wi-Fi: pass -PapiUrl=http://<pc-lan-ip>:3001 at build time.
        val apiUrl = (project.findProperty("apiUrl") as String?)
            ?: System.getenv("VETCURA_API_URL")
            ?: "http://10.0.2.2:3001"
        buildConfigField("String", "API_URL", "\"$apiUrl\"")
        // Public OAuth client ID (identifier, NOT a secret). Empty when
        // unconfigured: the app then hides Google Sign-In honestly.
        val googleClientId = (project.findProperty("googleClientId") as String?)
            ?: System.getenv("VETCURA_GOOGLE_CLIENT_ID")
            ?: ""
        buildConfigField("String", "GOOGLE_CLIENT_ID", "\"$googleClientId\"")
    }
    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core:1.6.8")
    implementation("androidx.compose.material:material-icons-extended:1.6.8")
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("io.coil-kt:coil-compose:2.6.0")
    implementation("com.vanniktech:android-image-cropper:4.5.0")
    implementation("com.google.android.gms:play-services-auth:21.2.0")
}
