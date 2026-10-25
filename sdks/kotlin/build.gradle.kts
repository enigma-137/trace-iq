import com.vanniktech.maven.publish.JavadocJar
import com.vanniktech.maven.publish.KotlinJvm
import com.vanniktech.maven.publish.SonatypeHost

plugins {
    kotlin("jvm") version "1.9.22"
    `java-library`
    id("com.vanniktech.maven.publish") version "0.30.0"
}

// Maven coordinates: run.traceiq:traceiq (namespace verified via the traceiq.run
// domain). The Kotlin package stays com.traceiq, so imports are unchanged.
group = "run.traceiq"
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

mavenPublishing {
    configure(KotlinJvm(javadocJar = JavadocJar.Empty(), sourcesJar = true))
    publishToMavenCentral(SonatypeHost.CENTRAL_PORTAL)
    // Only sign when a key is supplied (the release workflow), so local builds and
    // CI's publishToMavenLocal dry run work without one.
    if (providers.gradleProperty("signingInMemoryKey").isPresent) {
        signAllPublications()
    }
    coordinates("run.traceiq", "traceiq", version.toString())

    pom {
        name.set("TraceIQ Kotlin SDK")
        description.set("TraceIQ SDK for Kotlin: JVM servers and Android (API 21+). Batched event capture and structured logs, no dependencies.")
        inceptionYear.set("2026")
        url.set("https://github.com/enigma-137/trace-iq")
        licenses {
            license {
                name.set("MIT License")
                url.set("https://opensource.org/licenses/MIT")
                distribution.set("repo")
            }
        }
        developers {
            developer {
                id.set("enigma-137")
                name.set("TraceIQ")
                url.set("https://github.com/enigma-137")
            }
        }
        scm {
            url.set("https://github.com/enigma-137/trace-iq")
            connection.set("scm:git:https://github.com/enigma-137/trace-iq.git")
            developerConnection.set("scm:git:ssh://git@github.com/enigma-137/trace-iq.git")
        }
    }
}
