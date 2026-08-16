# kotlinx.serialization keeps its generated serializers on the companion object;
# R8 needs to be told they are reachable.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**

-keepclassmembers class app.masjidhub.staff.data.** {
    *** Companion;
}
-keepclasseswithmembers class app.masjidhub.staff.data.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# OkHttp ships optional references to Conscrypt/BouncyCastle providers.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
