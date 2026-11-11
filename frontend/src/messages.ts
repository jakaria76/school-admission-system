import { ApiError } from './api'

const BY_CODE: Record<string, string> = {
  NETWORK_ERROR:
    'সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না। সার্ভার বন্ধ থাকতে পারে, অথবা আপনার ইন্টারনেট সংযোগে সমস্যা। একটু পরে আবার চেষ্টা করুন।',
  CLASS_FULL: 'দুঃখিত, এই ক্লাসে আর কোনো আসন খালি নেই।',
  ALREADY_APPLIED: 'এই ক্লাসে আপনার একটি চলমান আবেদন বা নিশ্চিত ভর্তি আগে থেকেই আছে।',
  HOLD_EXPIRED: 'আবেদনের মেয়াদ শেষ হয়ে গেছে। আসন খালি থাকলে আবার আবেদন করতে পারবেন।',
  HOLD_CANCELLED: 'এই আবেদনটি আগেই বাতিল করা হয়েছে।',
  HOLD_CONFIRMED: 'ভর্তি নিশ্চিত হয়ে গেছে, তাই এই আবেদন আর বাতিল করা যাবে না।',
  NOT_OWNER: 'এই আবেদনটি অন্য শিক্ষার্থীর। উপরের ঘরে সঠিক জন্ম নিবন্ধন নম্বর দিন।',
  CLASS_NOT_FOUND: 'ক্লাসটি খুঁজে পাওয়া যায়নি।',
  HOLD_NOT_FOUND: 'আবেদনটি খুঁজে পাওয়া যায়নি।',
  STUDENT_ID_REQUIRED: 'উপরের ঘরে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন।',
  STUDENT_ID_INVALID: 'জন্ম নিবন্ধন নম্বর সঠিক নয়। ঠিক ১৭ অঙ্কের নম্বর লিখুন।',
  NAME_INVALID: 'ক্লাসের নাম সঠিক নয়। ১ থেকে ২০০ অক্ষরের মধ্যে নাম লিখুন।',
  TOTAL_SEATS_INVALID: 'আসন সংখ্যা সঠিক নয়। ১ থেকে ১,০০,০০০-এর মধ্যে একটি পূর্ণ সংখ্যা লিখুন।',
  SERVICE_UNAVAILABLE: 'সার্ভার এই মুহূর্তে সাড়া দিতে পারছে না। একটু পরে আবার চেষ্টা করুন।',
}

/** Turns any failure into a sentence the user can understand. Never returns an empty string. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const known = BY_CODE[error.code]
    if (known) return known
    if (error.status >= 500) return 'সার্ভারে একটি সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।'
    if (error.status === 404) return 'যা খুঁজছেন তা পাওয়া যায়নি।'
    return 'অনুরোধটি গ্রহণ করা যায়নি। তথ্যগুলো ঠিক আছে কি না দেখে আবার চেষ্টা করুন।'
  }
  return 'অপ্রত্যাশিত একটি সমস্যা হয়েছে। পেজটি আবার লোড করে চেষ্টা করুন।'
}
