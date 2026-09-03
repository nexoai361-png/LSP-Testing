# PRoot-Ubuntu-তে এই LSP এবং এডিটর প্রজেক্ট রান করার সম্পূর্ণ নির্দেশিকা

এই ডকুমেন্টেশনে আপনার GitHub রিপোজিটরি [https://github.com/nexoai361-png/LSP-Testing.git](https://github.com/nexoai361-png/LSP-Testing.git) ব্যবহার করে কীভাবে **Termux proot-ubuntu** এনভায়রনমেন্টে এই কোড এডিটরটি রান করবেন এবং HTML/CSS LSP (Language Server Protocol) সহ সকল ফিচার সচল করবেন তার প্রতিটি কমান্ড এবং ধাপ বিস্তারিত দেওয়া হলো।

---

## 🚀 সকল ফিচার একনজরে (Features)
1. **HTML & CSS LSP Integration**: অটো-কমপ্লিশন (Auto-completion), রিয়েল-টাইম ত্রুটি সনাক্তকরণ (Diagnostics/Errors), এবং ডেসক্রিপশন পপআপ (Hover Tooltips)।
2. **IndexedDB Local Storage**: রিস্টার্ট বা রিফ্রেশ করলেও সকল ট্যাব, ফাইল কোড এবং সেটিংস স্বয়ংক্রিয়ভাবে সংরক্ষিত থাকবে।
3. **Alt + Shift + F**: কোড নিমেষেই রি-ফরম্যাট করার জন্য LSP ফরম্যাটার যুক্ত কুইক কি বাটন।
4. **Minimal Custom Command Palette**: ডার্ক থিমযুক্ত স্টাইলিশ এবং রেসপনসিভ কমান্ড প্যালেট (`F1` বা `Ctrl+Shift+P` এর মাধ্যমে এক্সেসযোগ্য)।

---

## 🛠️ PRoot-Ubuntu-তে সম্পূর্ণ সেটআপ গাইড (Step-by-Step Installation)

আপনার proot-ubuntu টার্মিনালটি ওপেন করুন এবং নিচের কমান্ডগুলো একে একে রান করুন:

### ধাপ ১: সিস্টেম প্যাকেজ আপডেট করুন
সিস্টেমের প্যাকেজ লিস্ট আপডেট করতে এবং প্রয়োজনীয় বিল্ড টুলস ও গিট ইনস্টল করতে নিচের কমান্ডটি রান করুন:
```bash
apt update && apt upgrade -y && apt install -y git curl build-essential
```

### ধাপ ২: Node.js ইনস্টল করুন (যদি অলরেডি না থাকে)
ল্যাঙ্গুয়েজ সার্ভার এবং প্রক্সি রান করার জন্য Node.js v18 বা তার পরবর্তী ভার্সন প্রয়োজন। এটি ইনস্টল করতে রান করুন:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
```
*ইনস্টলেশন চেক করতে রান করতে পারেন: `node -v` এবং `npm -v`*

### ধাপ ৩: গ্লোবাল HTML/CSS LSP সার্ভার ইনস্টল করুন (সবচেয়ে গুরুত্বপূর্ণ ⚠️)
আমাদের এডিটরের প্রক্সি ল্যাঙ্গুয়েজ সার্ভারের সাথে কানেক্ট হওয়ার জন্য নিচের গ্লোবাল প্যাকেজটি ইনস্টল করা আবশ্যক:
```bash
npm install -g vscode-langservers-extracted
```
*(এই প্যাকেজটি ইনস্টল করার পর আপনার সিস্টেমে `vscode-html-language-server` এবং `vscode-css-language-server` সচল হয়ে যাবে)*

### ধাপ ৪: GitHub রিপোজিটরি ক্লোন করুন
আপনার প্রোজেক্ট রিপোজিটরিটি টার্মিনালে ক্লোন করুন এবং ডিরেক্টরিতে প্রবেশ করুন:
```bash
git clone https://github.com/nexoai361-png/LSP-Testing.git
cd LSP-Testing
```

### ধাপ ৫: প্রোজেক্ট ডিপেন্ডেন্সি ইনস্টল করুন
প্রোজেক্টের প্রয়োজনীয় লোকাল NPM প্যাকেজগুলো ইনস্টল করতে রান করুন:
```bash
 git pull origin main
```

### ধাপ ৬: অ্যাপ্লিকেশন রান করুন (Start the App)

#### ক. ডেভেলপমেন্ট মোড (Development Mode):
```bash
npm run dev
```

#### খ. প্রোডাকশন মোড (Production Mode - Highly Recommended):
প্রথমে প্রোজেক্টটি বিল্ড করুন এবং তারপর স্টার্ট করুন:
```bash
npm run build
npm start
```

---

## 🌐 কীভাবে ব্রাউজার থেকে ব্রাউজ করবেন (How to Access)
সার্ভারটি ডিফল্টভাবে **3000** পোর্টে রান হবে। 
আপনার ডিভাইসের যেকোনো ব্রাউজার ওপেন করুন এবং এড্রেস বারে নিচের লিঙ্কে প্রবেশ করুন:
```text
http://localhost:3000
```

---

## 🔍 সমস্যা সমাধান (Troubleshooting LSP)
* **ল্যাঙ্গুয়েজ সার্ভার কানেক্ট হচ্ছে না কেন?**
  * টার্মিনালে গ্লোবাল LSP প্যাকেজটি সঠিকভাবে ইনস্টল হয়েছে কি না তা চেক করুন। রান করুন: `vscode-html-language-server --version`। যদি এটি কোনো এরর দেখায়, তাহলে `npm install -g vscode-langservers-extracted` কমান্ডটি আবার রান করুন।
* **পোর্ট অলরেডি ব্যবহারে দেখাচ্ছে?**
  * যদি `PORT 3000` অলরেডি কোনো প্রসেস ব্যবহার করে থাকে, তাহলে প্রসেসটি বন্ধ করে পুনরায় স্টার্ট করুন অথবা `server.ts` ফাইলে গিয়ে পোর্ট নম্বরটি পরিবর্তন করে নিন।
