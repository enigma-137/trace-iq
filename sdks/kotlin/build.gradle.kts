plugins {
    kotlin("jvm") version "1.9.22"
    `java-library`
}

group = "com.traceiq"
version = "0.1.0"

repositories {
    mavenCentral()
}

kotlin {
    jvmToolchain(11)
}

// No third-party dependencies: uses java.net.HttpURLConnection + a tiny JSON encoder,
// so the same source works on the JVM and on Android (API 21+).

dependencies {
    // Tests only: the published library stays dependency-free.
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}
