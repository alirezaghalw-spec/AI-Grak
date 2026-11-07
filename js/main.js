// --------------------------------------------------- ورود با ایمیل
async function sendOtp(email) {
    const r = await fetch("/auth/email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
    });
    if (!r.ok) throw new Error("ارسال کد ناموفق بود");
    return r.json();
}

async function verifyOtp(email, code) {
    const r = await fetch("/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "کد اشتباه است");
    }
    const d = await r.json();
    localStorage.setItem("hoosh_session", d.session_token);
    localStorage.setItem("hoosh_email", d.email);
    return d;
}

// دکمه «ورود با ایمیل» در تنظیمات
$("emailLoginBtn").onclick = () => {
    const email = prompt("ایمیل خود را وارد کنید:");
    if (!email) return;
    sendOtp(email)
        .then(() => {
            const code = prompt("کد ۶ رقمی که به ایمیلتان فرستادیم را وارد کنید:");
            if (!code) return;
            return verifyOtp(email, code);
        })
        .then((d) => {
            if (d) {
                toast(`خوش آمدید ${d.email}`, 3000);
                updateUI();
            }
        })
        .catch((e) => alert(e.message));
};

// خروج
$("logoutBtn").onclick = async () => {
    await fetch("/auth/logout", {
        method: "POST",
        headers: { Authorization: "Bearer " + (localStorage.getItem("hoosh_session") || "") },
    });
    localStorage.removeItem("hoosh_session");
    localStorage.removeItem("hoosh_email");
    toast("خارج شدید");
    updateUI();
};
