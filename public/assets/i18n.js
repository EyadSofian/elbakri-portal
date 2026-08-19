(function () {
  const ar = {
    app: {
      name: "البكري أوفرسيز",
      tagline: "بوابة سفر B2B",
      superAdmin: "المشرف العام",
      agencyPortal: "بوابة الوكلاء",
      adminPortal: "بوابة الإدارة",
      est: "تأسست 1982",
    },
    nav: {
      overview: "نظرة عامة",
      workspace: "مساحة العمل",
      management: "الإدارة",
      services: "الخدمات",
      operations: "العمليات",
      finance: "المالية",
      analytics: "التحليلات",
      tools: "الأدوات",
      system: "النظام",
      dashboard: "لوحة التحكم",
      companies: "الشركات",
      users: "المستخدمون",
      hotels: "الفنادق",
      hotelPricing: "تسعير الفنادق",
      sheetsConfig: "إعدادات الشيت",
      nileCruises: "رحلات النيل",
      cruises: "رحلات النيل",
      transport: "النقل",
      transportBookings: "حجوزات النقل",
      activities: "الأنشطة",
      visa: "التأشيرات",
      reception: "استقبال المطار",
      bookings: "الحجوزات",
      invoices: "الفواتير",
      wallet: "المحفظة",
      reports: "التقارير",
      calculators: "الحاسبات",
      clients: "العملاء",
      flights: "البحث عن رحلات",
      support: "الدعم",
      settings: "الإعدادات",
      logout: "تسجيل الخروج",
      destinations: "الوجهات",
      quoteRequests: "طلبات الأسعار",
      myQuotes: "طلباتي",
    },
    topbar: {
      search: "ابحث عن حجز أو شركة أو عميل",
      command: "Ctrl K",
      wallet: "المحفظة",
      platformWallet: "محفظة المنصة",
      notifications: "الإشعارات",
      messages: "الرسائل",
      help: "المساعدة",
      lastRefresh: "آخر تحديث",
      justNow: "الآن",
      language: "اللغة",
    },
    page: {
      dashboardTitle: "لوحة التحكم",
      dashboardSub: "مؤشرات تشغيلية فورية عبر الحجوزات والماليات",
      companiesTitle: "الشركات",
      companiesSub: "إدارة وكالات السفر، المحافظ، حدود الائتمان والصلاحيات",
      usersTitle: "المستخدمون",
      usersSub: "إدارة حسابات الوكلاء ومشرفي الشركات",
      hotelsTitle: "الفنادق",
      hotelsSub: "كتالوج الفنادق والأسعار المتزامنة من Google Sheets",
      hotelPricingTitle: "تسعير الفنادق",
      hotelPricingSub: "أسعار متعددة للغرف والمواسم والعملات",
      sheetsTitle: "إعدادات Google Sheets",
      sheetsSub: "اختبار الاتصال وتشغيل المزامنة لكل بيانات الأساس",
      bookingsTitle: "الحجوزات",
      bookingsSub: "متابعة كل الحجوزات عبر الشركات",
      invoicesTitle: "الفواتير",
      invoicesSub: "حالات الدفع والاستحقاق والتصدير",
      walletTitle: "المحفظة",
      walletSub: "حركات الأرصدة والتسويات",
      reportsTitle: "التقارير",
      reportsSub: "الإيرادات والأداء حسب الشركة والخدمة",
      servicesTitle: "الخدمات",
      servicesSub: "إدارة وبيع خدمات السفر الأساسية",
      calculatorsTitle: "الحاسبات",
      calculatorsSub: "تحويل العملات بأسعار صرف محدثة",
      destinationsTitle: "الوجهات",
      destinationsSub: "إدارة الوجهات والمناطق السياحية الديناميكية",
      quoteRequestsTitle: "طلبات الأسعار",
      quoteRequestsSub: "طلبات التسعير المقدمة من الوكلاء",
    },
    dash: {
      morning: "صباح الخير",
      afternoon: "مساء الخير",
      evening: "مساء الخير",
      heroSub: "هذه نظرة عامة على عملياتك من الحجوزات والرصيد والطلبات.",
      bookHotel: "حجز فندق",
      newTransfer: "نقل جديد",
      quickActions: "إجراءات سريعة",
      adminEyebrow: "نظرة عامة على المنصة",
      adminTitle: "لوحة تحكم المشرف",
      adminSub: "تابع الحجوزات والأرصدة والشركات والطلبات عبر المنصة.",
    },
    view: {
      table: "عرض جدول", cards: "عرض بطاقات", label: "العرض",
      details: "عرض التفاصيل", apply: "تطبيق", gallery: "صور متاحة",
    },
    stat: {
      totalBookings: "إجمالي الحجوزات",
      totalRevenue: "إجمالي الإيرادات",
      pending: "قيد الانتظار",
      activeCompanies: "الشركات النشطة",
      activeUsers: "المستخدمون النشطون",
      walletExposure: "رصيد المحافظ",
      hotels: "الفنادق",
      services: "الخدمات",
      invoicesDue: "فواتير مستحقة",
      cancellations: "الإلغاءات",
      commission: "العمولة",
      markup: "هامش الربح",
      vsMonth: "مقارنة بالشهر الماضي",
      allTime: "كل الفترات",
      confirmedOnly: "الطلبات المؤكدة فقط",
      monthToDate: "منذ بداية الشهر",
      today: "اليوم",
      lastThirty: "آخر 30 يوم",
    },
    th: {
      select: "تحديد",
      logo: "الشعار",
      company: "الشركة",
      name: "الاسم",
      email: "البريد",
      phone: "الهاتف",
      tier: "الفئة",
      country: "الدولة",
      balance: "الرصيد",
      creditLimit: "حد الائتمان",
      bookingsCount: "الحجوزات",
      usersCount: "المستخدمون",
      status: "الحالة",
      lastActivity: "آخر نشاط",
      actions: "إجراءات",
      ref: "المرجع",
      type: "النوع",
      details: "التفاصيل",
      service: "الخدمة",
      route: "المسار",
      city: "المدينة",
      stars: "التصنيف",
      amount: "المبلغ",
      commission: "العمولة",
      markup: "الهامش",
      currency: "العملة",
      date: "التاريخ",
      requested: "تاريخ الطلب",
      confirmed: "تاريخ التأكيد",
      notConfirmed: "غير مؤكد",
      confirmedBy: "تم التأكيد بواسطة",
      pickup: "موعد الانطلاق",
      dueDate: "تاريخ الاستحقاق",
      invoice: "الفاتورة",
      voucher: "الباوتشر",
      before: "قبل",
      after: "بعد",
      reference: "مرجع",
      description: "الوصف",
      errors: "الأخطاء",
      created: "جديد",
      updated: "محدث",
      skipped: "متجاوز",
      synced: "تمت المزامنة",
      sheet: "الشيت",
      lastSync: "آخر مزامنة",
      schedule: "الجدولة",
      entity: "الكيان",
      result: "النتيجة",
      total: "الإجمالي",
      destination: "الوجهة",
      hotel: "الفندق",
      travelDates: "تواريخ السفر",
      assignedTo: "المكلف",
      slug: "الرابط",
      region: "المنطقة",
      priceVisibility: "رؤية الأسعار",
    },
    status: {
      PENDING: "قيد الانتظار",
      NEW: "جديد",
      IN_REVIEW: "قيد المراجعة",
      ACCEPTED: "مقبول",
      CONFIRMED: "مؤكد",
      CANCELLED: "ملغي",
      COMPLETED: "مكتمل",
      PAID: "مدفوع",
      UNPAID: "غير مدفوع",
      OVERDUE: "متأخر",
      APPROVED: "مقبول",
      REJECTED: "مرفوض",
      SUBMITTED: "مرسل",
      UNDER_REVIEW: "قيد المراجعة",
      ACTIVE: "نشط",
      INACTIVE: "غير نشط",
      CREDIT: "إضافة",
      DEBIT: "خصم",
      REFUND: "استرداد",
      ADJUSTMENT: "تسوية",
      SUCCESS: "نجاح",
      FAILED: "فشل",
      RUNNING: "قيد التشغيل",
      PARTIAL: "جزئي",
      QUOTED: "تم التسعير",
      CLOSED: "مغلق",
    },
    tier: {
      STANDARD: "قياسي",
      SILVER: "فضي",
      GOLD: "ذهبي",
      PLATINUM: "بلاتيني",
      standardDesc: "صلاحيات أساسية وحد ائتمان افتراضي",
      silverDesc: "أولوية دعم وهامش محسّن",
      goldDesc: "عمولات أعلى وحد ائتمان موسع",
      platinumDesc: "أفضل أسعار وخدمة مخصصة",
    },
    btn: {
      addNew: "إضافة جديد",
      newCompany: "شركة جديدة",
      save: "حفظ",
      saving: "جاري الحفظ",
      cancel: "إلغاء",
      confirm: "تأكيد",
      delete: "حذف",
      edit: "تعديل",
      view: "عرض",
      topup: "شحن",
      toggle: "تبديل الحالة",
      enable: "تفعيل",
      disable: "تعطيل",
      upload: "رفع صورة",
      uploading: "جاري الرفع",
      remove: "إزالة",
      exportExcel: "تصدير Excel",
      exportSelected: "تصدير المحدد",
      bulkTopup: "شحن جماعي",
      bulkDeactivate: "تعطيل جماعي",
      syncSheets: "مزامنة من الشيت",
      testConnection: "اختبار الاتصال",
      refresh: "تحديث",
      clear: "مسح",
      apply: "تطبيق",
      reset: "إعادة ضبط",
      close: "إغلاق",
      next: "التالي",
      back: "رجوع",
      createBooking: "إنشاء حجز",
      bookNow: "احجز الآن",
      markPaid: "تعيين كمدفوع",
      downloadPdf: "PDF",
      downloadInvoice: "تحميل الفاتورة",
      downloadVoucher: "تحميل الباوتشر",
      voucher: "باوتشر",
      sendNotification: "إرسال إشعار",
      scheduleSync: "جدولة المزامنة",
      newUser: "مستخدم جديد",
      resetPassword: "إعادة تعيين كلمة المرور",
      addFunds: "إضافة رصيد",
      approve: "موافقة",
      reject: "رفض",
      signIn: "دخول",
      requestQuote: "طلب سعر",
      requestTransportQuote: "طلب عرض سعر نقل",
      sendRequest: "إرسال الطلب",
      submitRequest: "تقديم الطلب",
      bookActivity: "احجز النشاط",
      book: "احجز",
      add: "إضافة",
      addDestination: "إضافة وجهة",
      editDestination: "تعديل الوجهة",
      clearFilters: "مسح الفلاتر",
      review: "مراجعة",
    },
    form: {
      basicInfo: "البيانات الأساسية",
      contact: "التواصل",
      financial: "المالية",
      branding: "الهوية",
      name: "الاسم",
      nameAr: "الاسم بالعربية",
      companyName: "اسم الشركة",
      email: "البريد الإلكتروني",
      phone: "الهاتف",
      country: "الدولة",
      website: "الموقع الإلكتروني",
      taxId: "الرقم الضريبي",
      address: "العنوان",
      billingAddress: "عنوان الفواتير",
      tier: "الفئة",
      creditLimit: "حد الائتمان",
      currency: "العملة",
      logo: "الشعار",
      themeColor: "لون الهوية",
      amount: "المبلغ",
      description: "الوصف",
      currentBalance: "الرصيد الحالي",
      search: "بحث",
      status: "الحالة",
      type: "النوع",
      allTiers: "كل الفئات",
      allStatuses: "كل الحالات",
      allCountries: "كل الدول",
      allTypes: "كل الأنواع",
      sheetsId: "معرف Google Sheets",
      cron: "تعبير Cron",
      required: "مطلوب",
      invalidEmail: "البريد الإلكتروني غير صحيح",
      positiveAmount: "أدخل مبلغاً أكبر من صفر",
      cityAr: "المدينة بالعربية",
      amenities: "المرافق",
      roomType: "نوع الغرفة",
      season: "الموسم",
      validFrom: "ساري من",
      validTo: "ساري حتى",
      checkIn: "تاريخ الوصول",
      checkOut: "تاريخ المغادرة",
      destination: "الوجهة / المنطقة",
      adults: "البالغون",
      children: "الأطفال",
      from: "من", to: "إلى", time: "الوقت", passengers: "الركاب", roundTrip: "ذهاب وعودة",
      nights: "الليالي",
      rooms: "الغرف",
      availableRooms: "الغرف المتاحة",
      maxGuestsPerRoom: "ضيوف لكل غرفة",
      commissionPercent: "نسبة عمولة الفندق",
      reason: "السبب",
      chooseDates: "اختر الفندق والتواريخ لحساب مبلغ الحجز",
      selectHotel: "اختر الفندق",
      openInventory: "مفتوح",
      operator: "المشغل",
      cabins: "الكبائن",
      departureDays: "أيام المغادرة",
      duration: "المدة",
      includes: "يشمل",
      excludes: "لا يشمل",
      priceAdult: "سعر البالغ",
      priceChild: "سعر الطفل",
      child: "طفل",
      minPax: "أقل عدد",
      maxPax: "أكبر عدد",
      vehicleType: "نوع المركبة",
      from: "من",
      to: "إلى",
      processingType: "المعالجة",
      role: "الدور",
      password: "كلمة المرور",
      none: "بدون",
      autoGenerate: "توليد تلقائي إذا تُركت فارغة",
      nationality: "الجنسية",
      nationalityPlaceholder: "مثال: مصري",
      notes: "ملاحظات",
      notesPlaceholder: "ملاحظات اختيارية",
      contactPreference: "التواصل المفضل",
      pax: "عدد المسافرين",
      budget: "الميزانية (تقريبي)",
      customerNotes: "ملاحظات العميل",
      internalNotes: "ملاحظات داخلية",
      quotedAmount: "السعر المعروض",
      slug: "الرابط المختصر",
      region: "المنطقة",
      isActive: "نشط",
      date: "التاريخ",
    },
    placeholder: {
      searchCompany: "بحث بالاسم أو البريد",
      searchAny: "بحث سريع",
      email: "agent@company.com",
      phone: "+20 2 1234 5678",
      website: "https://example.com",
      amount: "5000",
      description: "إيداع شهري",
      sheetsId: "1abcDEF...",
      cron: "*/30 * * * *",
      city: "المدينة",
      country: "الدولة",
      notes: "ملاحظات اختيارية",
    },
    modal: {
      companyNew: "إنشاء شركة",
      companyEdit: "تعديل الشركة",
      companyDetails: "تفاصيل الشركة",
      topup: "شحن المحفظة",
      confirmDelete: "تأكيد الحذف",
      confirmToggle: "تأكيد تغيير الحالة",
      bookingNew: "حجز جديد",
      syncResult: "نتيجة المزامنة",
      overview: "نظرة عامة",
      users: "المستخدمون",
      bookings: "الحجوزات",
      wallet: "المحفظة",
      invoices: "الفواتير",
      review: "المراجعة",
      details: "التفاصيل",
      type: "النوع",
      userNew: "مستخدم جديد",
      userEdit: "تعديل المستخدم",
      passwordReset: "كلمة مرور مؤقتة",
    },
    empty: {
      noData: "لا توجد بيانات",
      noCompanies: "لا توجد شركات مطابقة",
      noBookings: "لا توجد حجوزات",
      noInvoices: "لا توجد فواتير",
      noTransactions: "لا توجد حركات",
      noErrors: "لا توجد أخطاء حديثة",
      addFirst: "أضف أول سجل للبدء",
      adjustFilters: "جرّب تغيير الفلاتر",
      loading: "جاري التحميل",
      failed: "فشل التحميل",
      noQuotes: "لا توجد طلبات أسعار",
      noDestinations: "لا توجد وجهات مضافة",
    },
    toast: {
      saved: "تم الحفظ",
      created: "تم الإنشاء",
      updated: "تم التحديث",
      deleted: "تم الحذف",
      exported: "تم التصدير",
      syncStarted: "بدأت المزامنة",
      syncComplete: "اكتملت المزامنة",
      syncFailed: "فشلت المزامنة",
      topupDone: "تم شحن المحفظة",
      statusChanged: "تم تغيير الحالة",
      loginExpired: "انتهت الجلسة. سجل الدخول مرة أخرى",
      noRowsSelected: "اختر صفاً واحداً على الأقل",
      connectionOk: "الاتصال ناجح",
      connectionFailed: "فشل الاتصال",
      validationError: "راجع الحقول المطلوبة",
      unavailable: "لا توجد غرف كافية للتواريخ وعدد الضيوف المحدد",
      passwordReset: "تمت إعادة تعيين كلمة المرور",
      currencyMismatch: "اختر شركات بنفس العملة",
      deactivated: "تم التعطيل وإخفاؤه من القائمة",
      quoteSubmitted: "تم إرسال طلب السعر بنجاح",
      approved: "تمت الموافقة على الحجز",
      rejected: "تم رفض الطلب",
      pricesVisible: "أصبح السعر مرئياً للوكلاء",
      pricesHidden: "تم إخفاء السعر عن الوكلاء",
    },
    filter: {
      title: "الفلاتر",
      search: "بحث",
      tier: "الفئة",
      status: "الحالة",
      country: "الدولة",
      dateRange: "نطاق التاريخ",
      currency: "العملة",
      showInactive: "إظهار غير النشط",
      all: "الكل",
    },
    sync: {
      hotels: "الفنادق",
      hotelPricing: "تسعير الفنادق",
      cruises: "رحلات النيل",
      activities: "الأنشطة",
      transportRates: "أسعار النقل",
      visaFees: "رسوم التأشيرات",
      receptionServices: "خدمات الاستقبال",
      destinations: "الوجهات",
      manual: "يدوي",
      scheduled: "مجدول",
      source: "مصدر الحقيقة",
      sourceText: "Google Sheets هو مصدر بيانات الأساس",
      oneWay: "اتجاه واحد: من الشيت إلى قاعدة البيانات",
    },
    wallet: {
      platformSub: "رصيد متاح للتوزيع على الشركات",
      platformHistory: "حركات محفظة المنصة",
      platformRule: "أي شحن لشركة يتم خصمه من هذا الرصيد",
      addFunds: "إضافة رصيد لمحفظة المنصة",
      fundPlaceholder: "إيداع بنكي / نقدية مستلمة",
    },
    currency: {
      USD: "USD",
      EGP: "EGP",
      EUR: "EUR",
      SAR: "SAR",
      AED: "AED",
      GBP: "GBP",
    },
    login: {
      secure: "دخول آمن للوكلاء",
      workspace: "تسجيل دخول مساحة العمل",
      cardTitle: "بوابة الوكلاء",
      metricSupport: "دعم العمليات",
      metricCurrency: "عملات",
      metricSince: "تأسست",
      forgot: "نسيت كلمة المرور؟",
      footer: "لشركاء السفر المعتمدين فقط. يتم تسجيل النشاط لحماية الحساب.",
      title: "تسجيل الدخول",
      subtitle: "ادخل إلى بوابة السفر B2B",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      remember: "تذكرني",
      signIn: "دخول",
      signingIn: "جاري الدخول",
      invalid: "البريد أو كلمة المرور غير صحيحة",
      inactive: "الحساب غير نشط. تواصل مع المدير",
      network: "خطأ في الشبكة. تحقق من الاتصال",
      heroTitle: "تشغيل حجوزات السفر بكثافة ووضوح",
      heroSub: "محافظ، حدود ائتمان، حجوزات، فواتير ومزامنة بيانات الأساس في مكان واحد.",
    },
    hotel: {
      priceOnRequest: "السعر عند الطلب",
      visible: "مرئي",
      hidden: "مخفي",
      showPrices: "إظهار الأسعار",
      hidePrices: "إخفاء الأسعار",
      pricesNowVisible: "أصبح السعر مرئياً للوكلاء",
      pricesNowHidden: "تم إخفاء السعر عن الوكلاء",
    },
    quoteRequest: {
      intro: "أرسل طلب تسعير وسيقوم فريقنا بالرد عليك في أقرب وقت ممكن.",
      pendingLabel: "قيد المراجعة",
      quotedLabel: "تم التسعير",
      closedLabel: "مغلق",
    },
    booking: {
      pendingNote: "سيتم مراجعة طلبك من قبل الفريق وتأكيده خلال 24 ساعة.",
      approveConfirm: "هل تريد الموافقة على هذا الحجز؟",
      defaultRejectReason: "عذراً، لا تتوفر في الفترة المطلوبة.",
      hotelNote: "حجوزات الفنادق والباقات تتم عبر طلب سعر، لا تأكيد مباشر.",
    },
    contact: {
      email: "البريد الإلكتروني",
      whatsapp: "واتساب",
      phone: "هاتف",
    },
    validation: {
      required: "هذا الحقل مطلوب",
      dateRequired: "يرجى تحديد التاريخ",
      amountRequired: "يرجى إدخال مبلغ صحيح",
      invalidSlug: "الرابط يجب أن يحتوي على أحرف وأرقام وشرطات فقط",
    },
    invoice: {
      markPaidConfirm: "هل تريد تعيين هذه الفاتورة كمدفوعة؟",
      forHotel: "فاتورة فندق",
      forActivity: "فاتورة نشاط",
      forTransport: "فاتورة نقل",
    },
    destination: {
      deleteConfirm: "هل تريد حذف هذه الوجهة؟ سيتم إلغاء تنشيطها إذا كانت مرتبطة بفنادق أو أنشطة.",
      type: {
        CITY: "مدينة",
        RESORT: "منتجع",
        AREA: "منطقة",
        REGION: "إقليم",
      },
    },
  };

  const en = {
    app: {
      name: "Elbakri Overseas", tagline: "B2B travel portal", superAdmin: "Super Admin", agencyPortal: "Agency Portal",
      adminPortal: "Admin Portal", est: "Est. 1982",
    },
    nav: {
      overview: "Overview", workspace: "Workspace", management: "Management", services: "Services", operations: "Operations",
      finance: "Finance", analytics: "Analytics", tools: "Tools", system: "System", dashboard: "Dashboard", companies: "Companies",
      users: "Users", hotels: "Hotels", hotelPricing: "Hotel Pricing", sheetsConfig: "Sheets Config", nileCruises: "Nile Cruises",
      cruises: "Nile Cruises", transport: "Transport", transportBookings: "Transport Bookings", activities: "Activities",
      visa: "Visa Applications", reception: "Airport Reception", bookings: "Bookings", invoices: "Invoices", wallet: "Wallet",
      reports: "Reports", calculators: "Calculators", clients: "Clients", flights: "Flight Search", support: "Support",
      settings: "Settings", logout: "Logout",
      destinations: "Destinations",
      quoteRequests: "Quote Requests",
      myQuotes: "My Quotes",
    },
    topbar: {
      search: "Search booking, company, client", command: "Ctrl K", wallet: "Wallet", platformWallet: "Platform Wallet",
      notifications: "Notifications", messages: "Messages", help: "Help", lastRefresh: "Last refresh", justNow: "Just now", language: "Language",
    },
    page: {
      dashboardTitle: "Dashboard", dashboardSub: "Real-time operating indicators across bookings and finance",
      companiesTitle: "Companies", companiesSub: "Manage agencies, wallets, credit limits and account access",
      usersTitle: "Users", usersSub: "Manage agent and company admin accounts",
      hotelsTitle: "Hotels", hotelsSub: "Hotel catalog and rates synchronized from Google Sheets",
      hotelPricingTitle: "Hotel Pricing", hotelPricingSub: "Multi-room seasonal pricing and currencies",
      sheetsTitle: "Google Sheets Config", sheetsSub: "Test connection and trigger sync for all master data",
      bookingsTitle: "Bookings", bookingsSub: "Track all bookings across companies",
      invoicesTitle: "Invoices", invoicesSub: "Payment, due status and export workflows",
      walletTitle: "Wallet", walletSub: "Balance movements and adjustments",
      reportsTitle: "Reports", reportsSub: "Revenue and performance by company and service",
      servicesTitle: "Services", servicesSub: "Manage and sell travel services",
      calculatorsTitle: "Currency Converter", calculatorsSub: "Currency conversion with updated exchange rates",
      destinationsTitle: "Destinations", destinationsSub: "Manage dynamic travel destinations and areas",
      quoteRequestsTitle: "Quote Requests", quoteRequestsSub: "Price requests submitted by agents",
    },
    dash: {
      morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening",
      heroSub: "Here is your operations summary across bookings, balance and requests.",
      bookHotel: "Book a Hotel", newTransfer: "New Transfer", quickActions: "Quick actions",
      adminEyebrow: "Platform overview", adminTitle: "Super Admin Console",
      adminSub: "Monitor bookings, balances, companies and requests across the platform.",
    },
    view: {
      table: "Table view", cards: "Card view", label: "View",
      details: "View Details", apply: "Apply", gallery: "Photos available",
    },
    stat: {
      totalBookings: "Total Bookings", totalRevenue: "Total Revenue", pending: "Pending", activeCompanies: "Active Companies",
      activeUsers: "Active Users", walletExposure: "Wallet Exposure", hotels: "Hotels", services: "Services", invoicesDue: "Invoices Due",
      cancellations: "Cancellations", commission: "Commission", markup: "Markup", vsMonth: "vs last month", allTime: "All time", confirmedOnly: "Confirmed requests only",
      monthToDate: "Month to date", today: "Today", lastThirty: "Last 30 days",
    },
    th: {
      select: "Select", logo: "Logo", company: "Company", name: "Name", email: "Email", phone: "Phone", tier: "Tier", country: "Country",
      balance: "Balance", creditLimit: "Credit Limit", bookingsCount: "Bookings", usersCount: "Users", status: "Status",
      lastActivity: "Last Activity", actions: "Actions", ref: "Ref", type: "Type", details: "Details", service: "Service",
      route: "Route", city: "City", stars: "Stars", amount: "Amount", commission: "Commission", markup: "Markup", total: "Total",
      currency: "Currency", date: "Date", requested: "Date Requested", confirmed: "Date Confirmed", notConfirmed: "Not confirmed", confirmedBy: "Confirmed By", pickup: "Pickup", dueDate: "Due Date", invoice: "Invoice", voucher: "Voucher", before: "Before", after: "After",
      reference: "Reference", description: "Description", errors: "Errors", created: "Created", updated: "Updated",
      skipped: "Skipped", synced: "Synced", sheet: "Sheet", lastSync: "Last Sync", schedule: "Schedule", entity: "Entity", result: "Result",
      destination: "Destination", hotel: "Hotel", travelDates: "Travel Dates", assignedTo: "Assigned To",
      slug: "Slug", region: "Region", priceVisibility: "Price Visibility",
    },
    status: {
      PENDING: "Pending", NEW: "New", IN_REVIEW: "In Review", ACCEPTED: "Accepted",
      CONFIRMED: "Confirmed", CANCELLED: "Cancelled", COMPLETED: "Completed", PAID: "Paid", UNPAID: "Unpaid",
      OVERDUE: "Overdue", APPROVED: "Approved", REJECTED: "Rejected", SUBMITTED: "Submitted", UNDER_REVIEW: "Under Review",
      ACTIVE: "Active", INACTIVE: "Inactive", CREDIT: "Credit", DEBIT: "Debit", REFUND: "Refund", ADJUSTMENT: "Adjustment",
      SUCCESS: "Success", FAILED: "Failed", RUNNING: "Running", PARTIAL: "Partial",
      QUOTED: "Quoted", CLOSED: "Closed",
    },
    tier: {
      STANDARD: "Standard", SILVER: "Silver", GOLD: "Gold", PLATINUM: "Platinum",
      standardDesc: "Baseline access and default credit controls", silverDesc: "Priority support and better markup controls",
      goldDesc: "Higher commissions and extended credit", platinumDesc: "Best rates and dedicated service",
    },
    btn: {
      addNew: "Add New", newCompany: "New Company", save: "Save", saving: "Saving", cancel: "Cancel", confirm: "Confirm",
      delete: "Delete", edit: "Edit", view: "View", topup: "Top-up", toggle: "Toggle Status", enable: "Enable", disable: "Disable",
      upload: "Upload", uploading: "Uploading…", remove: "Remove",
      exportExcel: "Export to Excel", exportSelected: "Export Selected", bulkTopup: "Bulk Top-up", bulkDeactivate: "Bulk Deactivate",
      syncSheets: "Sync from Sheets", testConnection: "Test Connection", refresh: "Refresh", clear: "Clear", apply: "Apply",
      reset: "Reset", close: "Close", next: "Next", back: "Back", createBooking: "Create Booking", bookNow: "Book Now",
      markPaid: "Mark Paid", downloadPdf: "PDF", downloadInvoice: "Download Invoice", downloadVoucher: "Download Voucher", voucher: "Voucher", sendNotification: "Send notification", scheduleSync: "Schedule Sync",
      newUser: "New User", resetPassword: "Reset Password", addFunds: "Add Funds", approve: "Approve", reject: "Reject",
      signIn: "Sign In",
      requestQuote: "Request Quote",
      requestTransportQuote: "Request Transport Quote",
      sendRequest: "Send Request",
      submitRequest: "Submit Request",
      bookActivity: "Book Activity",
      book: "Book",
      add: "Add",
      addDestination: "Add Destination",
      editDestination: "Edit Destination",
      clearFilters: "Clear Filters",
      review: "Review",
    },
    form: {
      basicInfo: "Basic Info", contact: "Contact", financial: "Financial", branding: "Branding", name: "Name", nameAr: "Arabic Name",
      companyName: "Company Name", email: "Email", phone: "Phone", country: "Country", website: "Website", taxId: "Tax ID",
      address: "Address", billingAddress: "Billing Address", tier: "Tier", creditLimit: "Credit Limit", currency: "Currency",
      logo: "Logo", themeColor: "Theme Color", amount: "Amount", description: "Description", currentBalance: "Current Balance",
      search: "Search", status: "Status", type: "Type", allTiers: "All Tiers", allStatuses: "All Statuses",
      allCountries: "All Countries", allTypes: "All Types", sheetsId: "Google Sheets ID", cron: "Cron expression",
      required: "Required", invalidEmail: "Invalid email address", positiveAmount: "Enter an amount greater than zero",
      cityAr: "Arabic City", amenities: "Amenities", roomType: "Room Type", season: "Season", validFrom: "Valid From",
      validTo: "Valid To", checkIn: "Check-in", checkOut: "Check-out", destination: "Destination / Area", adults: "Adults", children: "Children",
      from: "From", to: "To", time: "Time", passengers: "Passengers", roundTrip: "Round Trip",
      nights: "Nights", rooms: "Rooms", availableRooms: "Available rooms", maxGuestsPerRoom: "Guests per room",
      commissionPercent: "Hotel commission %", reason: "Reason", chooseDates: "Choose hotel dates to calculate the booking amount",
      selectHotel: "Select hotel", openInventory: "Open", operator: "Operator", cabins: "Cabins", departureDays: "Departure Days", duration: "Duration",
      includes: "Includes", excludes: "Excludes", priceAdult: "Adult Price", priceChild: "Child Price", child: "Child",
      minPax: "Min Pax", maxPax: "Max Pax", vehicleType: "Vehicle Type", from: "From", to: "To", processingType: "Processing",
      role: "Role", password: "Password", none: "None", autoGenerate: "Auto-generate if empty",
      nationality: "Nationality",
      nationalityPlaceholder: "e.g. Egyptian",
      notes: "Notes",
      notesPlaceholder: "Optional notes",
      contactPreference: "Preferred Contact Method",
      pax: "No. of Travellers",
      budget: "Budget (approx.)",
      customerNotes: "Customer Notes",
      internalNotes: "Internal Notes",
      quotedAmount: "Quoted Amount",
      slug: "Slug",
      region: "Region",
      isActive: "Active",
      date: "Date",
    },
    placeholder: {
      searchCompany: "Search name or email", searchAny: "Quick search", email: "agent@company.com", phone: "+20 2 1234 5678",
      website: "https://example.com", amount: "5000", description: "Monthly deposit", sheetsId: "1abcDEF...",
      cron: "*/30 * * * *", city: "City", country: "Country", notes: "Optional notes",
    },
    modal: {
      companyNew: "Create Company", companyEdit: "Edit Company", companyDetails: "Company Details", topup: "Top-up Wallet",
      confirmDelete: "Confirm Delete", confirmToggle: "Confirm Status Change", bookingNew: "New Booking", syncResult: "Sync Result",
      overview: "Overview", users: "Users", bookings: "Bookings", wallet: "Wallet", invoices: "Invoices", review: "Review",
      details: "Details", type: "Type", userNew: "New User", userEdit: "Edit User", passwordReset: "Temporary Password",
    },
    empty: {
      noData: "No data found", noCompanies: "No matching companies", noBookings: "No bookings found", noInvoices: "No invoices found",
      noTransactions: "No transactions found", noErrors: "No recent errors", addFirst: "Add the first record to get started",
      adjustFilters: "Try changing the filters", loading: "Loading", failed: "Failed to load",
      noQuotes: "No quote requests found",
      noDestinations: "No destinations added yet",
    },
    toast: {
      saved: "Saved", created: "Created", updated: "Updated", deleted: "Deleted", exported: "Exported",
      syncStarted: "Sync started", syncComplete: "Sync complete", syncFailed: "Sync failed", topupDone: "Wallet topped up",
      statusChanged: "Status changed", loginExpired: "Session expired. Please login again", noRowsSelected: "Select at least one row",
      connectionOk: "Connection successful", connectionFailed: "Connection failed", validationError: "Check required fields",
      unavailable: "Not enough rooms for the selected dates and guests",
      passwordReset: "Password reset", currencyMismatch: "Select companies with the same currency",
      deactivated: "Deactivated and hidden",
      quoteSubmitted: "Quote request submitted successfully",
      approved: "Booking approved",
      rejected: "Booking rejected",
      pricesVisible: "Prices are now visible to agents",
      pricesHidden: "Prices are now hidden from agents",
    },
    filter: {
      title: "Filters", search: "Search", tier: "Tier", status: "Status", country: "Country",
      dateRange: "Date Range", currency: "Currency", showInactive: "Show inactive", all: "All",
    },
    sync: {
      hotels: "Hotels", hotelPricing: "Hotel Pricing", cruises: "Nile Cruises", activities: "Activities",
      transportRates: "Transport Rates", visaFees: "Visa Fees", receptionServices: "Reception Services",
      destinations: "Destinations",
      manual: "Manual", scheduled: "Scheduled", source: "Source of truth", sourceText: "Google Sheets is the source of truth for master data",
      oneWay: "One-way sync: Sheets to database",
    },
    wallet: {
      platformSub: "Funds available to allocate to companies",
      platformHistory: "Platform Ledger",
      platformRule: "Company top-ups deduct from this balance",
      addFunds: "Add Platform Funds",
      fundPlaceholder: "Bank deposit / cash received",
    },
    currency: { USD: "USD", EGP: "EGP", EUR: "EUR", SAR: "SAR", AED: "AED", GBP: "GBP" },
    login: {
      secure: "Secure agent access", workspace: "Workspace Login", cardTitle: "Agent Portal",
      metricSupport: "Ops support", metricCurrency: "Currencies", metricSince: "Established",
      forgot: "Forgot password?", footer: "Authorized B2B travel partners only. Activity is logged for account security.",
      title: "Sign In", subtitle: "Access the B2B travel portal", email: "Email Address", password: "Password",
      remember: "Remember me", signIn: "Sign In", signingIn: "Signing in", invalid: "Invalid email or password",
      inactive: "Your account is inactive. Contact your administrator.", network: "Network error. Check your connection.",
      heroTitle: "Dense travel operations with the numbers in plain sight",
      heroSub: "Wallets, credit limits, bookings, invoices and master-data sync in one professional workspace.",
    },
    hotel: {
      priceOnRequest: "Price on request",
      visible: "Visible",
      hidden: "Hidden",
      showPrices: "Show Prices",
      hidePrices: "Hide Prices",
      pricesNowVisible: "Prices are now visible to agents",
      pricesNowHidden: "Prices are now hidden from agents",
    },
    quoteRequest: {
      intro: "Submit a quote request and our team will respond as soon as possible.",
      pendingLabel: "Under Review",
      quotedLabel: "Quoted",
      closedLabel: "Closed",
    },
    booking: {
      pendingNote: "Your request will be reviewed by our team and confirmed within 24 hours.",
      approveConfirm: "Approve this booking request?",
      defaultRejectReason: "Unavailable for the requested dates.",
      hotelNote: "Hotel and package bookings go through the quote request flow.",
    },
    contact: {
      email: "Email",
      whatsapp: "WhatsApp",
      phone: "Phone",
    },
    validation: {
      required: "This field is required",
      dateRequired: "Please select a date",
      amountRequired: "Please enter a valid amount",
      invalidSlug: "Slug may only contain letters, numbers, and hyphens",
    },
    invoice: {
      markPaidConfirm: "Mark this invoice as paid?",
      forHotel: "Hotel Invoice",
      forActivity: "Activity Invoice",
      forTransport: "Transport Invoice",
    },
    destination: {
      deleteConfirm: "Delete this destination? It will be deactivated if linked to hotels or activities.",
      type: {
        CITY: "City",
        RESORT: "Resort",
        AREA: "Area",
        REGION: "Region",
      },
    },
  };

  // ── Supplemental keys (full EN/AR coverage for strings referenced in the app) ──
  Object.assign(en.btn, { addPricing: "Add price period", importExcel: "Import Excel", syncing: "Syncing…", importing: "Importing…", detailsRequest: "Details / Request" });
  Object.assign(ar.btn, { addPricing: "إضافة فترة سعر", importExcel: "استيراد Excel", syncing: "جاري المزامنة…", importing: "جاري الاستيراد…", detailsRequest: "التفاصيل / طلب" });
  Object.assign(en.toast, { syncDetail: "{synced} synced · {created} new · {updated} updated · {errors} errors" });
  Object.assign(ar.toast, { syncDetail: "{synced} تمت · {created} جديد · {updated} محدث · {errors} أخطاء" });
  Object.assign(en.filter, { any: "Any" });
  Object.assign(ar.filter, { any: "الكل" });
  Object.assign(en.form, { travelFrom: "Travelling From", travelFromPlaceholder: "e.g. Cairo, Riyadh, Milan", gallery: "Gallery image URLs" });
  Object.assign(ar.form, { travelFrom: "السفر من", travelFromPlaceholder: "مثال: القاهرة، الرياض، ميلان", gallery: "روابط صور المعرض" });
  Object.assign(en.hotel, { gallery: "Gallery" });
  Object.assign(ar.hotel, { gallery: "معرض الصور" });
  Object.assign(en.hotel, {
    companyVisibility: "Company price visibility",
    companyVisibilityHelp: "Use this to show or hide this hotel price for one specific company, overriding the tier rule.",
    quoteRequest: "Quote request",
  });
  Object.assign(ar.hotel, {
    companyVisibility: "رؤية السعر حسب الشركة",
    companyVisibilityHelp: "استخدم هذا لإظهار أو إخفاء سعر هذا الفندق لشركة محددة، متجاوزاً قاعدة الفئة.",
    quoteRequest: "طلب السعر",
  });
  Object.assign(en.toast, { invalidDateRange: "Valid To must be after Valid From" });
  Object.assign(ar.toast, { invalidDateRange: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية" });
  Object.assign(en.validation, { requiredFields: "From, To, and Date are required" });
  Object.assign(ar.validation, { requiredFields: "الحقول: من، إلى، والتاريخ مطلوبة" });
  en.voucher = { ...(en.voucher || {}), pending: "Voucher pending" };
  ar.voucher = { ...(ar.voucher || {}), pending: "الباوتشر قيد التجهيز" };
  Object.assign(en.currency, { companyHelp: "Company wallets support USD or EGP only. Egyptian companies default to EGP; international companies default to USD." });
  Object.assign(ar.currency, { companyHelp: "محافظ الشركات تدعم الدولار أو الجنيه فقط. الشركات المصرية افتراضياً بالجنيه، والشركات الدولية افتراضياً بالدولار." });

  // ── Security Approval (renamed Visa) ──────────────────────────────────────
  en.nav.securityApproval = "Security Approval";
  ar.nav.securityApproval = "الموافقة الأمنية";
  en.nav.airportAssist = "Airport Assist";
  ar.nav.airportAssist = "مساعدة المطار";
  en.nav.simCard = "SIM Card";
  ar.nav.simCard = "شريحة الاتصال";
  en.nav.offers = "Offers";
  ar.nav.offers = "العروض";

  en.page.securityApprovalTitle = "Security Approval";
  ar.page.securityApprovalTitle = "الموافقة الأمنية";
  en.page.securityApprovalSub = "Sharm El Sheikh, Cairo & Borg El Arab entry approvals";
  ar.page.securityApprovalSub = "موافقات الدخول — شرم الشيخ، القاهرة وبرج العرب";
  en.page.airportAssistTitle = "Airport Assist";
  ar.page.airportAssistTitle = "مساعدة المطار";
  en.page.airportAssistSub = "Meet & greet, VIP lounge and transfer assistance";
  ar.page.airportAssistSub = "الاستقبال والمرافقة وخدمات الترحيل";
  en.page.simCardTitle = "SIM Card";
  ar.page.simCardTitle = "شريحة الاتصال";
  en.page.simCardSub = "Egyptian SIM packages for your clients";
  ar.page.simCardSub = "باقات شريحة الاتصال المصرية لعملائكم";
  en.page.offersTitle = "Offers & Promotions";
  ar.page.offersTitle = "العروض والترويج";
  en.page.offersSub = "Manage promotional offers shown to company users";
  ar.page.offersSub = "إدارة العروض الترويجية المعروضة لمستخدمي الشركات";

  // ── Security Approval types ────────────────────────────────────────────────
  en.securityApproval = {
    sharm: "Sharm El Sheikh", cairo: "Cairo", borgElArab: "Borg El Arab",
    passportUpload: "Passport (image or PDF)", flightTicketUpload: "Flight Ticket (image or PDF)",
    paxCount: "Number of Passengers", hotelName: "Hotel Name",
    types: "Approval Type", selectType: "Select approval type",
    priceNote: "Price is set per person by admin",
    uploadNote: "Upload passport and flight ticket to proceed",
    passportNumber: "Passport Number", travelDate: "Arrival / Travel Date",
    consent: "I confirm the passenger details above are accurate and consent to sharing them with the relevant authorities for security clearance.",
    consentRequired: "Please confirm consent to proceed",
    newRequest: "New Security Request",
  };
  ar.securityApproval = {
    sharm: "شرم الشيخ", cairo: "القاهرة", borgElArab: "برج العرب",
    passportUpload: "جواز السفر (صورة أو PDF)", flightTicketUpload: "تذكرة الطيران (صورة أو PDF)",
    paxCount: "عدد المسافرين", hotelName: "اسم الفندق",
    types: "نوع الموافقة", selectType: "اختر نوع الموافقة",
    priceNote: "السعر محدد للشخص الواحد من الإدارة",
    uploadNote: "رفع جواز السفر وتذكرة الطيران للمتابعة",
    passportNumber: "رقم جواز السفر", travelDate: "تاريخ الوصول / السفر",
    consent: "أؤكد أن بيانات المسافر أعلاه صحيحة وأوافق على مشاركتها مع الجهات المختصة للحصول على الموافقة الأمنية.",
    consentRequired: "يرجى تأكيد الموافقة للمتابعة",
    newRequest: "طلب موافقة أمنية جديد",
  };

  // ── Airport Assist form ────────────────────────────────────────────────────
  en.airportAssist = {
    ticketUpload: "Flight Ticket (image or PDF)", arrivalDeparture: "Arrival / Departure Details",
    form: "Request Airport Assist", serviceType: "Service Type", newRequest: "New Airport Assist",
  };
  ar.airportAssist = {
    ticketUpload: "تذكرة الطيران (صورة أو PDF)", arrivalDeparture: "تفاصيل الوصول / المغادرة",
    form: "طلب مساعدة المطار", serviceType: "نوع الخدمة", newRequest: "طلب مساعدة مطار جديد",
  };

  // ── SIM Card ───────────────────────────────────────────────────────────────
  en.simCard = {
    package: "SIM Package", selectPackage: "Select a package", dataSize: "Data",
    minutes: "Minutes / Calls", validity: "Validity", clientName: "Client Name",
    phone: "Client Phone", quantity: "Quantity", arrivalDate: "Arrival Date",
    requestTitle: "Request SIM Card", noPackages: "No SIM packages available",
    perSim: "per SIM", newRequest: "New SIM Request",
  };
  ar.simCard = {
    package: "باقة الشريحة", selectPackage: "اختر باقة", dataSize: "البيانات",
    minutes: "دقائق / مكالمات", validity: "الصلاحية", clientName: "اسم العميل",
    phone: "هاتف العميل", quantity: "الكمية", arrivalDate: "تاريخ الوصول",
    requestTitle: "طلب شريحة اتصال", noPackages: "لا توجد باقات متاحة",
    perSim: "للشريحة", newRequest: "طلب شريحة جديد",
  };

  // ── Offers ─────────────────────────────────────────────────────────────────
  en.offers = {
    popup: "Special Offer", dontShow: "Don't show today", viewOffer: "View Offer",
    noOffer: "No active offers", active: "Active", inactive: "Inactive",
    priority: "Priority", imageUrl: "Image URL", ctaAction: "CTA Page (service key)",
    ctaLabel: "CTA Button Label", validDates: "Valid Dates",
    titleAr: "Arabic Title", descAr: "Arabic Description",
  };
  ar.offers = {
    popup: "عرض خاص", dontShow: "لا تُظهر اليوم", viewOffer: "عرض العرض",
    noOffer: "لا توجد عروض نشطة", active: "نشط", inactive: "غير نشط",
    priority: "الأولوية", imageUrl: "رابط الصورة", ctaAction: "صفحة CTA (مفتاح الخدمة)",
    ctaLabel: "نص زر CTA", validDates: "تواريخ الصلاحية",
    titleAr: "العنوان بالعربية", descAr: "الوصف بالعربية",
  };

  // ── Destination image upload (Phase 2) ─────────────────────────────────────
  en.upload = { badType: "Only JPG, PNG, GIF or WebP images are allowed", tooLarge: "Image must be under 10 MB", failed: "Upload failed" };
  ar.upload = { badType: "يُسمح بصور JPG أو PNG أو GIF أو WebP فقط", tooLarge: "يجب أن تكون الصورة أقل من 10 ميجابايت", failed: "فشل رفع الصورة" };
  Object.assign(en.form, { image: "Destination Image", imageAltEn: "Image Alt (EN)", imageAltAr: "Image Alt (AR)", or: "or", imagePreview: "Image preview" });
  Object.assign(ar.form, { image: "صورة الوجهة", imageAltEn: "وصف الصورة (إنجليزي)", imageAltAr: "وصف الصورة (عربي)", or: "أو", imagePreview: "معاينة الصورة" });

  // ── Currency converter (Phase 9) ───────────────────────────────────────────
  en.fx = {
    converterTitle: "Currency Converter", loading: "Loading rates…", amount: "Amount", from: "From", to: "To", swap: "Swap",
    updated: "Rates updated", unavailable: "Rates unavailable", stale: "Live rates unavailable — using last cached values", noRate: "Rate unavailable",
    providerStatus: "Rate provider", providerLive: "Live — provider reachable", providerStale: "Cached — rates may be stale", providerDown: "Provider unavailable — using last cached rates",
  };
  ar.fx = {
    converterTitle: "محوّل العملات", loading: "جارٍ تحميل الأسعار…", amount: "المبلغ", from: "من", to: "إلى", swap: "تبديل",
    updated: "تم تحديث الأسعار", unavailable: "الأسعار غير متوفرة", stale: "الأسعار المباشرة غير متوفرة — يتم استخدام آخر قيم محفوظة", noRate: "السعر غير متوفر",
    providerStatus: "مزود الأسعار", providerLive: "مباشر — المزود متاح", providerStale: "مخزّن — قد تكون الأسعار قديمة", providerDown: "المزود غير متاح — يتم استخدام آخر أسعار محفوظة",
  };
  en.calc = { converterTitle: "Currency Converter", amount: "Amount", from: "From", to: "To", swap: "Swap", result: "Converted amount" };
  ar.calc = { converterTitle: "محوّل العملات", amount: "المبلغ", from: "من", to: "إلى", swap: "تبديل", result: "المبلغ المحوّل" };
  en.nav.calculators = "Currency Converter";
  ar.nav.calculators = "محوّل العملات";

  // ── Hotels flow additions ──────────────────────────────────────────────────
  en.hotel.chooseDest = "Choose a destination to browse hotels";
  ar.hotel.chooseDest = "اختر الوجهة لاستعراض الفنادق";
  en.hotel.allDestinations = "All Destinations";
  ar.hotel.allDestinations = "جميع الوجهات";
  en.hotel.mealPlan = "Meal Plan";
  ar.hotel.mealPlan = "برنامج الوجبات";
  en.hotel.selectMealPlan = "Select meal plan";
  ar.hotel.selectMealPlan = "اختر برنامج الوجبات";
  en.hotel.childAge = "Child {n} Age";
  ar.hotel.childAge = "عمر الطفل {n}";
  en.hotel.pax = "Number of Pax";
  ar.hotel.pax = "عدد المسافرين";
  en.hotel.rooms = "Rooms";
  ar.hotel.rooms = "الغرف";
  en.hotel.terms = "Terms & Notes";
  ar.hotel.terms = "الشروط والملاحظات";

  // ── Wallet ─────────────────────────────────────────────────────────────────
  en.wallet.availableToSpend  = "Available to Spend";
  ar.wallet.availableToSpend  = "المتاح للإنفاق";
  en.wallet.walletBalance     = "Wallet Balance";
  ar.wallet.walletBalance     = "رصيد المحفظة";
  en.wallet.creditLimit       = "Credit Limit";
  ar.wallet.creditLimit       = "حد الائتمان";
  en.wallet.totalDeposited    = "Total Deposited";
  ar.wallet.totalDeposited    = "إجمالي المودع";
  en.wallet.totalUsed         = "Total Used / Deducted";
  ar.wallet.totalUsed         = "إجمالي المستخدم";
  en.wallet.remainingBalance  = "Remaining Balance";
  ar.wallet.remainingBalance  = "الرصيد المتبقي";

  // ── Meal plans ─────────────────────────────────────────────────────────────
  en.mealPlan = {
    ROOM_ONLY: "Room Only", BREAKFAST: "Breakfast Only", HALF_BOARD: "Half Board",
    FULL_BOARD: "Full Board", ALL_INCLUSIVE: "All Inclusive", ULTRA_ALL_INCLUSIVE: "Ultra All Inclusive",
  };
  ar.mealPlan = {
    ROOM_ONLY: "غرفة فقط", BREAKFAST: "إفطار فقط", HALF_BOARD: "نصف إقامة",
    FULL_BOARD: "إقامة كاملة", ALL_INCLUSIVE: "شامل كل شيء", ULTRA_ALL_INCLUSIVE: "شامل كل شيء بالكامل",
  };

  // ── Transport additions ────────────────────────────────────────────────────
  en.transport = {
    requestTitle: "Book Transport", passengerName: "Lead Passenger Name",
    contactPhone: "Contact Phone", priceEstimate: "Estimated Price",
    livePrice: "Price updates automatically", bookConfirmed: "Book (Confirmed)",
    confirmNote: "This creates a confirmed booking. Admin will be notified.",
    vehicleHint: {
      SEDAN: "1–3 pax", SUV: "1–5 pax", VAN_6: "4–6 pax", VAN_12: "7–12 pax",
      MINIBUS_20: "13–20 pax", BUS_45: "21–45 pax", LUXURY_LIMO: "VIP",
    },
  };
  ar.transport = {
    requestTitle: "حجز نقل", passengerName: "اسم المسافر الرئيسي",
    contactPhone: "هاتف التواصل", priceEstimate: "السعر التقديري",
    livePrice: "السعر يتحدث تلقائياً", bookConfirmed: "احجز (مؤكد)",
    confirmNote: "يُنشئ هذا حجزاً مؤكداً. سيتم إخطار الإدارة.",
    vehicleHint: {
      SEDAN: "1–3 مسافرين", SUV: "1–5 مسافرين", VAN_6: "4–6 مسافرين", VAN_12: "7–12 مسافرين",
      MINIBUS_20: "13–20 مسافرين", BUS_45: "21–45 مسافرين", LUXURY_LIMO: "VIP",
    },
  };

  // ── Activities additions ───────────────────────────────────────────────────
  en.activity = {
    requestTitle: "Activity Request", vipType: "Type", group: "Group", private: "Private", vip: "VIP",
    timeSlot: "Date & Time", duration: "Duration / Time", actType: "Booking Type",
    contactForTime: "Contact us for available times",
  };
  ar.activity = {
    requestTitle: "طلب نشاط", vipType: "النوع", group: "جماعي", private: "خاص", vip: "VIP",
    timeSlot: "التاريخ والوقت", duration: "المدة / الوقت", actType: "نوع الحجز",
    contactForTime: "تواصل معنا للاستفسار عن الأوقات المتاحة",
  };
  Object.assign(en.activity, {
    singleMode: "Single Activity",
    singleModeHelp: "Pick one trip, fill its details, then confirm the request.",
    packageMode: "Activity Package",
    packageModeHelp: "Add multiple trips to one package cart and submit them together.",
    packageCart: "Package Cart",
    packagePickHelp: "Choose each trip and fill its own details before submitting.",
    addToPackage: "Add to Package",
    submitPackage: "Submit Package",
    packageEmpty: "No trips added yet",
    timeConflict: "This package already has a trip at the same date/time.",
    packageSubmitted: "Package submitted",
    packagePartial: "Package stopped because one trip failed.",
  });
  Object.assign(ar.activity, {
    singleMode: "رحلة واحدة",
    singleModeHelp: "اختر رحلة واحدة واملأ بياناتها ثم أكد الطلب.",
    packageMode: "باكدج رحلات",
    packageModeHelp: "أضف أكثر من رحلة في سلة واحدة وأرسلهم معاً.",
    packageCart: "سلة الباكدج",
    packagePickHelp: "اختر كل رحلة واملأ بياناتها قبل الإرسال.",
    addToPackage: "أضف للباكدج",
    submitPackage: "إرسال الباكدج",
    packageEmpty: "لم يتم إضافة رحلات بعد",
    timeConflict: "يوجد رحلة في نفس التاريخ والوقت داخل الباكدج.",
    packageSubmitted: "تم إرسال الباكدج",
    packagePartial: "توقف إرسال الباكدج بسبب فشل إحدى الرحلات.",
  });

  // ── Transport extra keys ───────────────────────────────────────────────────
  Object.assign(en.transport, {
    tripType: "Trip Type", oneWay: "One Way", flightDetails: "Flight / Arrival Details",
    // Same section, without a plane to meet.
    pickupWhen: "Pickup Date & Time",
    route: "Route", passengers: "Passengers & Vehicle", priceSummary: "Price Summary",
    airport: "Airport", destination: "Destination",
    address: "Address", landmark: "Landmark",
    pickupAddress: "Pickup address / landmark", dropoffAddress: "Drop-off address / landmark",
    sameRouteReversed: "Same route, reversed (return mirrors the outbound trip)",
    differentReturnNote: "A different return route is priced as two legs. If no return price is configured you'll see Price on request.",
    returnFrom: "Return From", returnTo: "Return To",
    returnFromPlaceholder: "Return pickup location", returnToPlaceholder: "Return drop-off location",
    returnPickupHotelName: "Return Pickup Hotel Name", returnDropoffHotelName: "Return Drop-off Hotel Name",
    returnAfterOutbound: "Return date/time must be later than the outbound pickup",
    returnEndpointsRequired: "Enter the return pickup and drop-off for the different return route",
    pickupRequiredDisposal: "Choose Hotel or Address and enter where the driver should pick you up",
    pickupAddrRequired: "Pickup address is required", dropoffAddrRequired: "Drop-off address is required",
    pickupHotelRequired: "Pickup hotel name is required", dropoffHotelRequired: "Drop-off hotel name is required",
    airlineName: "Airline Name", flightNumber: "Flight Number",
    returnDate: "Return Date", returnTime: "Return Time",
    returnAirline: "Return Airline", returnFlight: "Return Flight No.",
    returnDetails: "Return Trip Details",
    leadName: "Lead Passenger Name", contactPhone: "Contact Phone",
    namePlaceholder: "Full name",
    selectLocation: "Select location...", selectVehicle: "Select vehicle...",
    noRateNote: "No fixed rate. Send a quote request and we'll get back to you.",
    requiredFields: "Please fill: route, date, lead name, contact and vehicle",
    bookConfirmed: "Confirm Booking", newBooking: "New Booking",
    bookingConfirmed: "Booking Submitted",
  });
  Object.assign(ar.transport, {
    tripType: "نوع الرحلة", oneWay: "ذهاب فقط", flightDetails: "بيانات الرحلة / الوصول",
    pickupWhen: "موعد الاستلام",
    route: "المسار", passengers: "المسافرون والمركبة", priceSummary: "ملخص السعر",
    airport: "المطار", destination: "الوجهة",
    address: "عنوان", landmark: "معلم",
    pickupAddress: "عنوان / معلم الاستلام", dropoffAddress: "عنوان / معلم التوصيل",
    sameRouteReversed: "نفس المسار بالعكس (العودة تعكس رحلة الذهاب)",
    differentReturnNote: "مسار العودة المختلف يُسعّر كرحلتين. إذا لم يوجد سعر للعودة سيظهر: السعر عند الطلب.",
    returnFrom: "العودة من", returnTo: "العودة إلى",
    returnFromPlaceholder: "موقع استلام العودة", returnToPlaceholder: "موقع توصيل العودة",
    returnPickupHotelName: "اسم فندق استلام العودة", returnDropoffHotelName: "اسم فندق توصيل العودة",
    returnAfterOutbound: "يجب أن يكون موعد العودة بعد موعد الذهاب",
    returnEndpointsRequired: "أدخل نقطتي استلام وتوصيل العودة للمسار المختلف",
    pickupRequiredDisposal: "اختر فندق أو عنوان وأدخل مكان استلام السائق لك",
    pickupAddrRequired: "عنوان الاستلام مطلوب", dropoffAddrRequired: "عنوان التوصيل مطلوب",
    pickupHotelRequired: "اسم فندق الاستلام مطلوب", dropoffHotelRequired: "اسم فندق التوصيل مطلوب",
    airlineName: "اسم الناقل الجوي", flightNumber: "رقم الرحلة",
    returnDate: "تاريخ العودة", returnTime: "وقت العودة",
    returnAirline: "ناقل رحلة العودة", returnFlight: "رقم رحلة العودة",
    returnDetails: "تفاصيل رحلة العودة",
    leadName: "اسم المسافر الرئيسي", contactPhone: "هاتف التواصل",
    namePlaceholder: "الاسم الكامل",
    selectLocation: "اختر الموقع...", selectVehicle: "اختر المركبة...",
    noRateNote: "لا يوجد سعر ثابت لهذا المسار. أرسل طلب سعر وسنرد عليك.",
    requiredFields: "يرجى ملء: المسار، التاريخ، اسم المسافر، رقم الاتصال والمركبة",
    bookConfirmed: "تأكيد الحجز", newBooking: "حجز جديد",
    bookingConfirmed: "تم إرسال الحجز",
  });

  // ── misc btn additions ─────────────────────────────────────────────────────
  en.btn.saving = "Saving...";
  ar.btn.saving = "جاري الحفظ...";

  // ── Hotel filters (sheet-driven amenities) ──────────────────────────────────
  Object.assign(en.filter, {
    area: "Area", amenities: "Amenities",
    aquaPark: "Aqua Park", privateBeach: "Private Beach", seaFront: "Sea Front",
    sandyBeach: "Sandy Beach", kidsPool: "Kids Pool", kidsClub: "Kids Club",
    allInclusive: "All Inclusive", snorkeling: "Snorkeling", diving: "Diving",
    adultsOnly: "Adults Only",
  });
  Object.assign(ar.filter, {
    area: "المنطقة", amenities: "المرافق",
    aquaPark: "أكوا بارك", privateBeach: "شاطئ خاص", seaFront: "على البحر",
    sandyBeach: "شاطئ رملي", kidsPool: "مسبح أطفال", kidsClub: "نادي أطفال",
    allInclusive: "شامل كلياً", snorkeling: "سنوركلينج", diving: "غوص",
    adultsOnly: "للبالغين فقط",
  });
  en.hotel.searchName = "Hotel name...";
  ar.hotel.searchName = "اسم الفندق...";

  // ── UI Builder (admin) ──────────────────────────────────────────────────────
  en.nav.uiBuilder = "UI Builder";
  ar.nav.uiBuilder = "منشئ الواجهة";
  en.page.uiBuilderTitle = "UI Builder / Portal Templates";
  ar.page.uiBuilderTitle = "منشئ الواجهة / قوالب البوابة";
  en.page.uiBuilderSub = "Control dashboard cards, request forms and offer popups — no code";
  ar.page.uiBuilderSub = "تحكّم في بطاقات اللوحة ونماذج الطلبات ونوافذ العروض — بدون كود";
  en.uiBuilder = {
    newTemplate: "New Template", target: "Target", blocks: "Blocks", addBlock: "Add Block",
    blockType: "Block Type", icon: "Icon", dataSource: "Data Source", title: "Title (EN)",
    titleAr: "Title (AR)", activate: "Activate", active: "Active", preview: "Preview",
    duplicate: "Duplicate", moveUp: "Move Up", moveDown: "Move Down", visible: "Visible",
    livePreview: "Live Preview", saveActivate: "Save & Activate", noTemplates: "No templates yet",
  };
  ar.uiBuilder = {
    newTemplate: "قالب جديد", target: "الهدف", blocks: "العناصر", addBlock: "إضافة عنصر",
    blockType: "نوع العنصر", icon: "الأيقونة", dataSource: "مصدر البيانات", title: "العنوان (EN)",
    titleAr: "العنوان (AR)", activate: "تفعيل", active: "نشط", preview: "معاينة",
    duplicate: "نسخ", moveUp: "أعلى", moveDown: "أسفل", visible: "ظاهر",
    livePreview: "معاينة حية", saveActivate: "حفظ وتفعيل", noTemplates: "لا توجد قوالب بعد",
  };

  // ── Request Form Builder ────────────────────────────────────────────────────
  en.nav.requestForms = "Request Forms";
  ar.nav.requestForms = "نماذج الطلبات";
  en.page.requestFormsTitle = "Request Form Builder";
  ar.page.requestFormsTitle = "منشئ نماذج الطلبات";
  en.page.requestFormsSub = "Control the fields of every customer request form — no code";
  ar.page.requestFormsSub = "تحكّم في حقول كل نموذج طلب للعميل — بدون كود";
  en.rfBuilder = {
    targetForm: "Target Form", loadDefault: "Load Default Fields", fields: "Fields",
    addField: "Add Field", titleEn: "Form Title (EN)", titleAr: "Form Title (AR)",
    customerPreview: "Customer Preview", saveDraft: "Save Draft", activate: "Activate",
    deleteTemplate: "Delete Template", unsaved: "Unsaved defaults", noFields: "No fields yet — click Add Field",
    key: "Key", type: "Type", labelEn: "Label (EN)", labelAr: "Label (AR)",
    phEn: "Placeholder (EN)", phAr: "Placeholder (AR)", icon: "Icon", width: "Width",
    min: "Min", max: "Max", options: "Options — value | label | labelAr per line",
    required: "Required", visible: "Visible", show: "Show", hide: "Hide", up: "Up", down: "Down", delete: "Delete",
    confirmDefault: "Replace the fields below with the built-in defaults?",
    confirmDelete: "Delete this form template? The form reverts to its built-in default.",
    activated: "Form activated", errKey: "Every field needs a key",
    errKeyChars: "Keys allow letters, numbers and underscore only", errDup: "Field keys must be unique",
    noVisible: "No visible fields", childAgesNote: "Child age inputs appear based on children count",
    selectedService: "Selected service",
  };
  ar.rfBuilder = {
    targetForm: "النموذج المستهدف", loadDefault: "تحميل الحقول الافتراضية", fields: "الحقول",
    addField: "إضافة حقل", titleEn: "عنوان النموذج (EN)", titleAr: "عنوان النموذج (AR)",
    customerPreview: "معاينة العميل", saveDraft: "حفظ مسودة", activate: "تفعيل",
    deleteTemplate: "حذف القالب", unsaved: "إعدادات افتراضية غير محفوظة", noFields: "لا حقول بعد — اضغط إضافة حقل",
    key: "المفتاح", type: "النوع", labelEn: "التسمية (EN)", labelAr: "التسمية (AR)",
    phEn: "النص التوضيحي (EN)", phAr: "النص التوضيحي (AR)", icon: "الأيقونة", width: "العرض",
    min: "الأدنى", max: "الأقصى", options: "الخيارات — value | label | labelAr لكل سطر",
    required: "إلزامي", visible: "ظاهر", show: "إظهار", hide: "إخفاء", up: "أعلى", down: "أسفل", delete: "حذف",
    confirmDefault: "استبدال الحقول أدناه بالحقول الافتراضية؟",
    confirmDelete: "حذف قالب النموذج؟ سيعود النموذج إلى الافتراضي.",
    activated: "تم تفعيل النموذج", errKey: "كل حقل يحتاج مفتاحاً",
    errKeyChars: "المفاتيح تسمح بالأحرف والأرقام والشرطة السفلية فقط", errDup: "يجب أن تكون مفاتيح الحقول فريدة",
    noVisible: "لا حقول ظاهرة", childAgesNote: "تظهر حقول أعمار الأطفال حسب عدد الأطفال",
    selectedService: "الخدمة المختارة",
  };
  en.quoteDetail = Object.assign({}, en.quoteDetail, { customFields: "Additional Fields" });
  ar.quoteDetail = Object.assign({}, ar.quoteDetail, { customFields: "حقول إضافية" });
  en.validation.fieldRequired = "Please complete";
  ar.validation.fieldRequired = "يرجى إكمال";
  en.page.enrichTitle = "Hotel Enrichment";
  ar.page.enrichTitle = "إثراء بيانات الفنادق";
  en.page.enrichSub   = "Fetch gallery, ratings and descriptions from Booking.com via Apify";
  ar.page.enrichSub   = "جلب الصور والتقييمات والأوصاف من Booking.com عبر Apify";
  en.form.select = "Select";
  ar.form.select = "اختر";
  en.form.orPasteUrl = "or paste URL";
  ar.form.orPasteUrl = "أو الصق الرابط";

  // ── Dashboard offers card ───────────────────────────────────────────────────
  en.offers.dashboardCard = "Active Offers";
  ar.offers.dashboardCard = "العروض النشطة";
  en.offers.viewAll = "View Offers";
  ar.offers.viewAll = "عرض العروض";

  en.validation.childAges = "Please enter all children ages";
  ar.validation.childAges = "يرجى إدخال أعمار جميع الأطفال";

  en.transport.serviceType = "Service Type";
  ar.transport.serviceType = "نوع الخدمة";

  // ── At-disposal transport (the third trip shape) ───────────────────────────
  // A car booked for a BLOCK OF TIME inside an area instead of for a route:
  // the client keeps the car and driver and goes wherever they like. None of
  // this vocabulary existed in Arabic before, so the terms are spelled out
  // rather than transliterated: "تحت التصرف" is the phrase Egyptian operators
  // actually use for a car placed at a client's disposal.
  Object.assign(en.transport, {
    atDisposal: "At Disposal",
    atDisposalFull: "Car at your disposal",
    atDisposalTag: "No fixed route",
    disposalExplain: "The car and driver stay with you for the whole period inside the area you choose — you decide where to go, and there is no fixed drop-off. Ideal for a day out, shopping, meetings or sightseeing.",
    disposalArea: "Where do you want the car?",
    disposalAreaHint: "The city or area the car stays within.",
    disposalPackage: "For how long?",
    disposalPackageHint: "One price for the whole block — moving around inside it costs nothing extra.",
    selectArea: "Choose an area...",
    noAreas: "No at-disposal service is configured yet. Send a quote request instead.",
    noPackages: "No package is available in this area for the chosen vehicle and passenger count.",
    hoursUnit: "hours",
    fullDay: "Full day",
    perVehicle: "per vehicle",
    disposalPickup: "Where should the driver pick you up?",
    disposalPickupHint: "Your hotel or an address inside the area. There is no drop-off to enter — the driver brings you back.",
    disposalNoReturn: "A return trip does not apply to an at-disposal booking: coming back is already included in the hours you booked.",
    disposalAreaRequired: "Choose the area where you want the car",
    disposalPackageRequired: "Choose how long you want the car for",
    disposalSummary: "Car at disposal",
    disposalDuration: "Duration",
  });
  Object.assign(ar.transport, {
    atDisposal: "تحت التصرف",
    atDisposalFull: "سيارة تحت تصرفك",
    atDisposalTag: "بدون مسار محدد",
    disposalExplain: "السيارة والسائق يفضلوا معاك طول المدة جوه المنطقة اللي تختارها — إنت اللي تحدد تروح فين، ومفيش مكان توصيل ثابت. مناسبة ليوم كامل برّه، أو تسوّق، أو اجتماعات، أو زيارة المعالم.",
    disposalArea: "عايز العربية فين؟",
    disposalAreaHint: "المدينة أو المنطقة اللي السيارة تفضل تلف جواها.",
    disposalPackage: "لمدة قد إيه؟",
    disposalPackageHint: "سعر واحد للمدة كلها — لفّك جوه المنطقة مش هيزوّد أي تكلفة.",
    selectArea: "اختر المنطقة...",
    noAreas: "لا توجد خدمة تحت التصرف مضافة حتى الآن. أرسل طلب سعر بدلاً من ذلك.",
    noPackages: "لا توجد باقة متاحة في هذه المنطقة لنوع السيارة وعدد الركاب المختار.",
    hoursUnit: "ساعات",
    fullDay: "يوم كامل",
    perVehicle: "للسيارة",
    disposalPickup: "السائق يستلمك من فين؟",
    disposalPickupHint: "فندقك أو عنوان جوه المنطقة. مش محتاج تدخل مكان توصيل — السائق هيرجّعك.",
    disposalNoReturn: "الذهاب والعودة لا ينطبق على الحجز تحت التصرف: الرجوع أصلاً داخل ضمن الساعات اللي حجزتها.",
    disposalAreaRequired: "اختر المنطقة اللي عايز العربية فيها",
    disposalPackageRequired: "اختر مدة تأجير السيارة",
    disposalSummary: "سيارة تحت التصرف",
    disposalDuration: "المدة",
  });

  // ── Activity pricing basis (per head vs a flat party rate) ─────────────────
  Object.assign(en.activity, {
    pricingBasis: "How would you like to book?",
    perPerson: "Per person",
    wholeParty: "for the whole party",
    pricingBasisHint: "A party price is one flat price for the group — it is not multiplied by the number of people.",
  });
  Object.assign(ar.activity, {
    pricingBasis: "عايز تحجز إزاي؟",
    perPerson: "بالفرد",
    wholeParty: "للمجموعة كلها",
    pricingBasisHint: "سعر المجموعة سعر واحد ثابت للمجموعة — مش بيتضرب في عدد الأفراد.",
  });

  // ── Activity detail (description, excludes) ────────────────────────────────
  en.form = Object.assign({}, en.form, { excludes: "Not included" });
  ar.form = Object.assign({}, ar.form, { excludes: "غير شامل" });

  // ── Transport rate form (mode-aware) ───────────────────────────────────────
  Object.assign(en.transport, {
    serviceAreaReq: "Area the car stays in (e.g. Cairo)",
    durationHoursReq: "Hours the car is at disposal",
    modeHintDisposal: "The car stays with the client inside one area for a block of time. Fill in the area and the hours — there is no From/To and no round-trip price, because coming back is already part of the package.",
    modeHintRoute: "A journey from one point to another. Fill in the From and To below; the round-trip price is optional and defaults to twice the one-way.",
  });
  Object.assign(ar.transport, {
    serviceAreaReq: "المنطقة اللي العربية تفضل جواها (مثال: القاهرة)",
    durationHoursReq: "عدد الساعات اللي العربية تحت التصرف فيها",
    modeHintDisposal: "العربية بتفضل مع العميل جوه منطقة واحدة لمدة محددة. املا المنطقة وعدد الساعات — مفيش من/إلى ومفيش سعر ذهاب وعودة، لأن الرجوع أصلاً داخل في الباقة.",
    modeHintRoute: "رحلة من نقطة لنقطة. املا \"من\" و\"إلى\" تحت؛ سعر الذهاب والعودة اختياري ولو سيبته فاضي هيتحسب ضعف سعر الذهاب.",
  });

  en.page = Object.assign({}, en.page, {
    visaFeesTitle: "Approval fees",
    visaFeesSub: "What each security approval costs, by type and processing speed",
    receptionServicesTitle: "Airport assist services",
    receptionServicesSub: "The assist services offered at each airport and their rates",
  });
  ar.page = Object.assign({}, ar.page, {
    visaFeesTitle: "رسوم الموافقات الأمنية",
    visaFeesSub: "تكلفة كل موافقة أمنية حسب النوع وسرعة الإنجاز",
    receptionServicesTitle: "خدمات مساعدة المطار",
    receptionServicesSub: "الخدمات المتاحة في كل مطار وأسعارها",
  });

  // ── Security approval / airport assist: requests vs their settings ─────────
  en.securityAdmin = { requests: "Requests", fees: "Approval fees" };
  ar.securityAdmin = { requests: "الطلبات", fees: "رسوم الموافقات" };
  en.receptionAdmin = { requests: "Requests", services: "Services & rates" };
  ar.receptionAdmin = { requests: "الطلبات", services: "الخدمات والأسعار" };

  // ── Base price vs the per-market rate rows ─────────────────────────────────
  // The English labels carried "(fallback)"; the Arabic ones said only
  // "المبلغ" / "العملة", so an Arabic admin read them as the hotel's real price.
  Object.assign(en.hotel, {
    basePrice: "Base price / night (fallback)",
    baseCurrency: "Base currency (fallback)",
    basePriceHelp: "This pair is only a fallback. A client sees the Pricing tab's rate for their own market — Gulf, Local, Middle East and so on, each with its own currency. The base price is shown only when no rate row matches that client's market.",
    noMarketRates: "No market rates yet — every client sees the base price above.",
    marketCoverage: "Priced for",
  });
  Object.assign(ar.hotel, {
    basePrice: "السعر الأساسي / الليلة (احتياطي)",
    baseCurrency: "العملة الأساسية (احتياطي)",
    basePriceHelp: "الخانتين دول احتياطي بس. العميل بيشوف السعر بتاع سوقه من تبويب التسعير — خليج، محلي، شرق أوسط وهكذا، وكل سوق بعملته. السعر الأساسي ده مبيظهرش غير لما مايكونش في صف سعر مطابق لسوق العميل.",
    noMarketRates: "لسه مفيش أسعار أسواق — كل العملاء هيشوفوا السعر الأساسي اللي فوق.",
    marketCoverage: "متسعّر لـ",
  });

  // ── Hotel rate rows (seasons + markets) ────────────────────────────────────
  Object.assign(en.hotel, {
    periodsHelp: "One row per period and per market: add a row for each season (Valid from / Valid to) and a row for each market you sell at a different price. Rows never overwrite each other.",
    duplicateRate: "Duplicate",
    duplicateRateHint: "Copy this row to price another season or market",
    allYear: "All year",
    rowsCount: "rows",
  });
  Object.assign(ar.hotel, {
    periodsHelp: "صف لكل فترة ولكل سوق: ضيف صف لكل موسم (من تاريخ / إلى تاريخ) وصف لكل سوق بتبيع له بسعر مختلف. الصفوف مش بتمسح بعضها أبداً.",
    duplicateRate: "نسخ الصف",
    duplicateRateHint: "انسخ الصف ده عشان تسعّر موسم تاني أو سوق تاني",
    allYear: "طول السنة",
    rowsCount: "صف",
  });

  // ── Markets and rate-row vocabulary ────────────────────────────────────────
  en.market = Object.assign({}, en.market, {
    ALL: "All markets", EGYPTIAN: "Local market", GULF: "Gulf",
    MIDDLE_EAST: "Middle East", NORTH_AFRICA: "North Africa", ARAB_48: "Arab 48",
    FOREIGN: "Foreign", INTERNATIONAL: "International", label: "Market",
  });
  ar.market = Object.assign({}, ar.market, {
    ALL: "كل الأسواق", EGYPTIAN: "السوق المحلي", GULF: "الخليج",
    MIDDLE_EAST: "الشرق الأوسط", NORTH_AFRICA: "شمال أفريقيا", ARAB_48: "عرب ٤٨",
    FOREIGN: "أجنبي", INTERNATIONAL: "دولي", label: "السوق",
  });

  // What a supplement does to the room price.
  en.suppType = Object.assign({}, en.suppType, {
    TEXT_ONLY: "Note only (no price change)",
    FIXED_AMOUNT: "Add an amount (+)",
    PERCENTAGE: "Add a percentage (%)",
    TOTAL_PRICE: "Full price for this room type",
  });
  ar.suppType = Object.assign({}, ar.suppType, {
    TEXT_ONLY: "ملاحظة فقط (بدون تغيير السعر)",
    FIXED_AMOUNT: "يضيف مبلغ (+)",
    PERCENTAGE: "يضيف نسبة (%)",
    TOTAL_PRICE: "السعر الكامل لنوع الغرفة ده",
  });

  en.mealPlanAdmin = {
    title: "Meal plans", help: "The board basis options offered on hotel rate rows. Add your own at any time.",
    add: "Add meal plan", code: "Code", nameEn: "Name (EN)", nameAr: "Name (AR)", order: "Order",
    inUse: "in use", saved: "Meal plan saved", removed: "Meal plan removed",
    nameRequired: "Enter an English name for the meal plan.",
  };
  ar.mealPlanAdmin = {
    title: "أنظمة الوجبات", help: "الأنظمة اللي بتظهر في صفوف أسعار الفنادق. تقدر تضيف اللي إنت عايزه في أي وقت.",
    add: "إضافة نظام وجبات", code: "الكود", nameEn: "الاسم (إنجليزي)", nameAr: "الاسم (عربي)", order: "الترتيب",
    inUse: "مستخدم", saved: "تم حفظ نظام الوجبات", removed: "تم حذف نظام الوجبات",
    nameRequired: "اكتب اسم إنجليزي لنظام الوجبات.",
  };

  // ── Global search (top bar) ────────────────────────────────────────────────
  en.search = Object.assign({}, en.search, {
    bookings: "Bookings", transport: "Transport", invoices: "Invoices",
    quotes: "Quotes", companies: "Clients", hotels: "Hotels",
    noResults: "Nothing matched",
  });
  ar.search = Object.assign({}, ar.search, {
    bookings: "الحجوزات", transport: "النقل", invoices: "الفواتير",
    quotes: "طلبات الأسعار", companies: "العملاء", hotels: "الفنادق",
    noResults: "لا توجد نتائج لـ",
  });

  // ── Route direction (one-way vs two-way rates) ─────────────────────────────
  Object.assign(en.transport, {
    bidirAirportHint: "Left on for a normal city-to-city transfer, which usually costs the same both ways. Airport transfers start off, because an arrival often costs more than a departure — tick it yourself when the two directions are priced alike.",
    makeBidir: "Make selected two-way",
    makeOneWay: "Make selected one-way",
    madeBidir: "Now priced in both directions",
    madeOneWay: "Now priced one way only",
  });
  Object.assign(ar.transport, {
    bidirAirportHint: "بتفضل مفتوحة في الانتقالات العادية بين المدن، لأنها غالباً بنفس السعر رايح جاي. انتقالات المطار بتبدأ مقفولة، لأن الاستقبال عادةً أغلى من التوصيل — افتحها بنفسك لو الاتجاهين بنفس السعر.",
    makeBidir: "خلي المحدد اتجاهين",
    makeOneWay: "خلي المحدد اتجاه واحد",
    madeBidir: "اتسعّرت في الاتجاهين",
    madeOneWay: "اتسعّرت في اتجاه واحد بس",
  });

  // Service modes spelled out for people, not as raw enum names.
  en.serviceMode = Object.assign({}, en.serviceMode, {
    POINT_TO_POINT: "Point to point", AIRPORT_TRANSFER: "Airport transfer",
    HOURLY_CHARTER: "At disposal — by the hour", DAY_USE: "At disposal — full day",
  });
  ar.serviceMode = Object.assign({}, ar.serviceMode, {
    POINT_TO_POINT: "من نقطة إلى نقطة", AIRPORT_TRANSFER: "انتقال المطار",
    HOURLY_CHARTER: "تحت التصرف — بالساعة", DAY_USE: "تحت التصرف — يوم كامل",
  });
  en.pricing = Object.assign({}, en.pricing, { fixed: "fixed" });
  ar.pricing = Object.assign({}, ar.pricing, { fixed: "ثابت" });
  en.market = Object.assign({}, en.market, { INTERNATIONAL: "International" });
  ar.market = Object.assign({}, ar.market, { INTERNATIONAL: "دولي" });
  en.invoice = Object.assign({}, en.invoice, {
    consolidated: "Consolidated Statements",
    individualHelp: "Individual service invoices",
    consolidatedCompanyHelp: "Download a combined PDF or Excel statement prepared by the admin.",
    loadEligible: "Choose a company, then load eligible invoices.",
    noneEligible: "No unconsolidated invoices match these filters.",
    eligible: "eligible invoices",
    items: "items",
  });
  ar.invoice = Object.assign({}, ar.invoice, {
    consolidated: "الفواتير المجمعة",
    individualHelp: "فواتير الخدمات الفردية",
    consolidatedCompanyHelp: "نزّل كشفاً مجمعاً بصيغة PDF أو Excel أعدته الإدارة.",
    loadEligible: "اختر شركة ثم حمّل الفواتير المتاحة للتجميع.",
    noneEligible: "لا توجد فواتير غير مجمعة تطابق هذه الفلاتر.",
    eligible: "فاتورة متاحة",
    items: "بنود",
  });
  en.btn = Object.assign({}, en.btn, { load: "Load Invoices", selectAll: "Select All" });
  ar.btn = Object.assign({}, ar.btn, { load: "تحميل الفواتير", selectAll: "تحديد الكل" });
  en.th = Object.assign({}, en.th, { period: "Period" });
  ar.th = Object.assign({}, ar.th, { period: "الفترة" });

  const dict = { en, ar };

  function deepGet(obj, path) {
    return String(path || "").split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
  }

  function currentLang() {
    return localStorage.getItem("lang") || document.documentElement.lang || "en";
  }

  function t(key, fallback) {
    const lang = currentLang();
    return deepGet(dict[lang], key) ?? deepGet(dict.en, key) ?? fallback ?? key;
  }

  function applyTranslations(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
    });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.setAttribute("title", t(el.dataset.i18nTitle));
    });
    scope.querySelectorAll("[data-i18n-label]").forEach((el) => {
      el.setAttribute("aria-label", t(el.dataset.i18nLabel));
    });
  }

  function setLang(lang) {
    const next = lang === "ar" ? "ar" : "en";
    localStorage.setItem("lang", next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-lang]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === next);
    });
    applyTranslations();
    document.dispatchEvent(new CustomEvent("portal:lang", { detail: { lang: next } }));
  }

  function initI18n() {
    setLang(currentLang());
    document.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-lang]");
      if (btn) setLang(btn.dataset.lang);
    });
  }

  function formatNumber(value, options) {
    return new Intl.NumberFormat(currentLang() === "ar" ? "ar-EG" : "en-US", options).format(Number(value || 0));
  }

  function formatMoney(value, currency) {
    return new Intl.NumberFormat(currentLang() === "ar" ? "ar-EG" : "en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat(currentLang() === "ar" ? "ar-EG" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  }

  // ── Additional keys (2026-06-13: transport hotels/round-trip, packages,
  //    bulk invoices, currency-aware pricing). Deep-merged so existing keys win. ──
  (function mergeNewKeys() {
    const add = {
      en: {
        transport: {
          hotel: "Hotel", pickupHotelName: "Pickup Hotel Name", dropoffHotelName: "Drop-off Hotel Name",
          returnFrom: "Return From", returnTo: "Return To",
          returnFromPlaceholder: "Defaults to drop-off location", returnToPlaceholder: "Defaults to pickup location",
          returnPickupHotelName: "Return Pickup Hotel Name", returnDropoffHotelName: "Return Drop-off Hotel Name",
          pickupHotelRequired: "Choose a hotel or type the pickup hotel name", dropoffHotelRequired: "Choose a hotel or type the drop-off hotel name",
          airport: "Airport", destination: "Destination", route: "Route", service: "Service", mode: "Service mode",
          serviceArea: "Service area (e.g. Cairo)", durationHours: "Duration hours (disposal)",
          serviceNameEn: "Service name (EN)", serviceNameAr: "Service name (AR)",
          bidirectional: "Bidirectional — also prices the reverse route (B → A) at the same price", bidirShort: "bidirectional",
          pricingDual: "Pricing (explicit, no FX — Egyptian sees EGP, others USD)",
          priceEgp: "One-way EGP", priceUsd: "One-way USD", rtEgp: "Round-trip EGP", rtUsd: "Round-trip USD",
          priceHint: "Leave a currency blank to show 'Price on request' for that market. Round-trip blank = 2 × one-way.",
          needPrice: "Enter at least an EGP or USD price.",
          endpointType: "Type", endpointName: "Display name (optional override)", endpointNamePh: "Auto from selection, or type a name",
          airports: "Airports", airportsHelp: "Admin-managed airport list used by transport routes and the customer form.",
          airportCode: "Code", airportNameEn: "Name (EN)", airportNameAr: "Name (AR)",
          selectAirport: "Select airport...", selectDestination: "Select destination...", selectHotel: "Select hotel...",
          orTypeHotel: "…or type hotel / location name",
        },
        hotel: {
          tabBasic: "Basic Info", tabImages: "Images", tabAmenities: "Amenities", tabPolicies: "Policies", tabPricing: "Pricing",
          area: "Area / Sub-area", linkedDestination: "Linked destination", noDestination: "— No linked destination —", rating: "Rating (0-5)",
          mainImage: "Main image", uploadMain: "Upload main image", gallery: "Gallery", uploadGallery: "Upload gallery images",
          galleryHint: "Select multiple files at once. Reorder with the arrows. Click ★ to make an image the main image.",
          noImage: "No main image", noGallery: "No gallery images yet.", setMain: "Set as main", moveLeft: "Move left", moveRight: "Move right",
          customAmenity: "Add a custom amenity", checkInTime: "Check-in time", checkOutTime: "Check-out time",
          cancellationPolicy: "Cancellation policy", cancellationPolicyAr: "Cancellation policy (AR)",
          childrenPolicy: "Children policy", childrenPolicyAr: "Children policy (AR)",
          extraBedPolicy: "Extra bed policy", extraBedPolicyAr: "Extra bed policy (AR)",
          mealPolicy: "Meal policy", mealPolicyAr: "Meal policy (AR)",
          importantNotes: "Important notes", importantNotesAr: "Important notes (AR)",
          rateMatrixHelp: "Each row is a room rate for one market with single / double / triple prices in an explicit currency (no FX). Market = ALL applies when no market-specific row exists. Add supplements per row.",
          addRate: "Add rate row", roomName: "Room name", mealPlan: "Meal plan", single: "Single", double: "Double", triple: "Triple",
          supplements: "Supplements", addSupplement: "Add supplement", suppName: "Name", suppType: "Type",
          rates: "Room Rates", occupancy: "Occupancy", supplement: "Supplement", noSupplement: "None",
          pricePreview: "Price preview", occNotAvailable: "Not available for this occupancy", policies: "Hotel policies",
        },
        activity: {
          transferIncluded: "Transport included", myPackages: "My Packages",
          myPackagesHelp: "Each package groups several activities under one reference.",
          activities: "activities", timeConflict: "This package already has a trip overlapping that date/time.",
        },
        invoice: { downloadSelected: "Download selected as PDF", downloadCombined: "Download Combined PDF", selected: "selected", selectAll: "Select all", downloaded: "Combined invoice PDF downloaded" },
        form: { currency: "Currency", price: "Price" },
        market: { pricingTitle: "Egyptian Market Price" },
        btn: { clear: "Clear" },
        simCard: { quantity: "Quantity", perSim: "per SIM" },
        theme: { label: "Theme", light: "Light theme", dark: "Dark theme" },
      },
      ar: {
        transport: {
          hotel: "فندق", pickupHotelName: "اسم فندق الاستلام", dropoffHotelName: "اسم فندق التوصيل",
          returnFrom: "العودة من", returnTo: "العودة إلى",
          returnFromPlaceholder: "افتراضيًا مكان التوصيل", returnToPlaceholder: "افتراضيًا مكان الاستلام",
          returnPickupHotelName: "فندق استلام العودة", returnDropoffHotelName: "فندق توصيل العودة",
          pickupHotelRequired: "اختر فندقًا أو اكتب اسم فندق الاستلام", dropoffHotelRequired: "اختر فندقًا أو اكتب اسم فندق التوصيل",
          airport: "مطار", destination: "وجهة", route: "المسار", service: "الخدمة", mode: "نوع الخدمة",
          serviceArea: "منطقة الخدمة (مثال: القاهرة)", durationHours: "عدد الساعات (التأجير)",
          serviceNameEn: "اسم الخدمة (إنجليزي)", serviceNameAr: "اسم الخدمة (عربي)",
          bidirectional: "اتجاهين — يسعّر المسار العكسي (ب ← أ) بنفس السعر", bidirShort: "اتجاهين",
          pricingDual: "التسعير (صريح، بدون تحويل عملة — المصري يرى الجنيه، الآخرون الدولار)",
          priceEgp: "ذهاب بالجنيه", priceUsd: "ذهاب بالدولار", rtEgp: "ذهاب وعودة بالجنيه", rtUsd: "ذهاب وعودة بالدولار",
          priceHint: "اترك العملة فارغة لإظهار 'السعر عند الطلب' لهذا السوق. الذهاب والعودة فارغ = ضعف سعر الذهاب.",
          needPrice: "أدخل سعرًا بالجنيه أو الدولار على الأقل.",
          endpointType: "النوع", endpointName: "اسم العرض (اختياري)", endpointNamePh: "تلقائي من الاختيار أو اكتب اسمًا",
          airports: "المطارات", airportsHelp: "قائمة المطارات التي يديرها المشرف وتُستخدم في مسارات النقل ونموذج العميل.",
          airportCode: "الرمز", airportNameEn: "الاسم (إنجليزي)", airportNameAr: "الاسم (عربي)",
          selectAirport: "اختر المطار...", selectDestination: "اختر الوجهة...", selectHotel: "اختر الفندق...",
          orTypeHotel: "…أو اكتب اسم الفندق / المكان",
        },
        hotel: {
          tabBasic: "البيانات الأساسية", tabImages: "الصور", tabAmenities: "المرافق", tabPolicies: "السياسات", tabPricing: "التسعير",
          area: "المنطقة", linkedDestination: "الوجهة المرتبطة", noDestination: "— بدون وجهة مرتبطة —", rating: "التقييم (0-5)",
          mainImage: "الصورة الرئيسية", uploadMain: "رفع الصورة الرئيسية", gallery: "معرض الصور", uploadGallery: "رفع صور المعرض",
          galleryHint: "اختر عدة ملفات دفعة واحدة. أعد الترتيب بالأسهم. اضغط ★ لجعل الصورة رئيسية.",
          noImage: "لا توجد صورة رئيسية", noGallery: "لا توجد صور بعد.", setMain: "تعيين كرئيسية", moveLeft: "تحريك لليسار", moveRight: "تحريك لليمين",
          customAmenity: "أضف مرفقًا مخصصًا", checkInTime: "وقت الوصول", checkOutTime: "وقت المغادرة",
          cancellationPolicy: "سياسة الإلغاء", cancellationPolicyAr: "سياسة الإلغاء (عربي)",
          childrenPolicy: "سياسة الأطفال", childrenPolicyAr: "سياسة الأطفال (عربي)",
          extraBedPolicy: "سياسة السرير الإضافي", extraBedPolicyAr: "سياسة السرير الإضافي (عربي)",
          mealPolicy: "سياسة الوجبات", mealPolicyAr: "سياسة الوجبات (عربي)",
          importantNotes: "ملاحظات هامة", importantNotesAr: "ملاحظات هامة (عربي)",
          rateMatrixHelp: "كل صف هو سعر غرفة لسوق معيّن بأسعار فردي / مزدوج / ثلاثي بعملة صريحة (بدون تحويل). السوق = الكل يُطبّق عند عدم وجود صف خاص بالسوق. أضف الإضافات لكل صف.",
          addRate: "إضافة صف سعر", roomName: "اسم الغرفة", mealPlan: "نظام الوجبات", single: "فردي", double: "مزدوج", triple: "ثلاثي",
          supplements: "الإضافات", addSupplement: "إضافة مكمل", suppName: "الاسم", suppType: "النوع",
          rates: "أسعار الغرف", occupancy: "الإشغال", supplement: "الإضافة", noSupplement: "بدون",
          pricePreview: "معاينة السعر", occNotAvailable: "غير متاح لهذا الإشغال", policies: "سياسات الفندق",
        },
        activity: {
          transferIncluded: "يشمل المواصلات", myPackages: "باقاتي",
          myPackagesHelp: "كل باقة تجمع عدة أنشطة تحت مرجع واحد.",
          activities: "أنشطة", timeConflict: "هذه الباقة بها رحلة في نفس التاريخ/الوقت المتداخل.",
        },
        invoice: { downloadSelected: "تحميل المحدد كـ PDF", downloadCombined: "تحميل PDF مجمّع", selected: "محدد", selectAll: "تحديد الكل", downloaded: "تم تحميل ملف الفواتير المجمّع" },
        form: { currency: "العملة", price: "السعر" },
        market: { pricingTitle: "سعر السوق المصري" },
        btn: { clear: "مسح" },
        simCard: { quantity: "الكمية", perSim: "لكل شريحة" },
        theme: { label: "المظهر", light: "المظهر الفاتح", dark: "المظهر الداكن" },
      },
    };
    const merge = (target, src) => {
      for (const k of Object.keys(src)) {
        if (src[k] && typeof src[k] === "object") { target[k] = target[k] || {}; merge(target[k], src[k]); }
        else if (target[k] === undefined) target[k] = src[k];
      }
    };
    if (dict.en) merge(dict.en, add.en);
    if (dict.ar) merge(dict.ar, add.ar);
  })();

  // ── Activities organised by destination, with uploaded photos, and the
  //    admin's full control over security approvals. ──────────────────────
  (function () {
    const en = dict.en, ar = dict.ar;
    Object.assign(en.form, {
      pickDestination: "Pick a destination",
      newDestinationHint: "Add a destination that is missing — it is saved to the Destinations page too.",
      noPhotosYet: "No photos yet",
      photo: "Photo",
      duration: "Duration / Slots",
      approvalLocation: "Approval location",
      processing: "Processing",
      passportNumber: "Passport number",
      passportExpiry: "Passport expiry",
      travelDate: "Travel date",
      hotelName: "Hotel",
      comingFrom: "Coming from",
      flightNumber: "Flight number",
    });
    Object.assign(ar.form, {
      pickDestination: "اختر الوجهة",
      newDestinationHint: "أضف وجهة غير موجودة — سيتم حفظها في صفحة الوجهات أيضًا.",
      noPhotosYet: "لا توجد صور بعد",
      photo: "الصورة",
      duration: "المدة / المواعيد",
      approvalLocation: "مكان الموافقة",
      processing: "سرعة الإنجاز",
      passportNumber: "رقم جواز السفر",
      passportExpiry: "تاريخ انتهاء الجواز",
      travelDate: "تاريخ السفر",
      hotelName: "الفندق",
      comingFrom: "قادم من",
      flightNumber: "رقم الرحلة",
    });
    Object.assign(en.btn, {
      addPhotos: "Add photos",
      upload: "Upload",
      uploading: "Uploading…",
      remove: "Remove",
      addDestination: "Add Destination",
      editDestination: "Edit Destination",
      newApproval: "New approval",
    });
    Object.assign(ar.btn, {
      addPhotos: "إضافة صور",
      upload: "رفع",
      uploading: "جاري الرفع…",
      remove: "حذف",
      addDestination: "إضافة وجهة",
      editDestination: "تعديل الوجهة",
      newApproval: "موافقة جديدة",
    });
    Object.assign(en.filter, { all: "All" });
    Object.assign(ar.filter, { all: "الكل" });
    en.activity = en.activity || {}; ar.activity = ar.activity || {};
    Object.assign(en.activity, {
      catalog: "Activity Catalog",
      byDestination: "Trips by destination",
      byDestinationHelp: "Pick a destination to see only its trips — anything you add from there is filed under it.",
      noDestination: "No destination",
      showInactive: "Show hidden",
      noTimeSet: "No time set",
      noPrice: "No price set",
      prices: "Prices",
      mainPhoto: "Main photo",
      photos: "More photos",
      destination: "Destination",
      cityLabel: "City label (optional)",
    });
    Object.assign(ar.activity, {
      catalog: "قائمة الرحلات",
      byDestination: "الرحلات حسب الوجهة",
      byDestinationHelp: "اختر وجهة لعرض رحلاتها فقط — وأي رحلة تضيفها من هنا تُسجَّل تحتها.",
      noDestination: "بدون وجهة",
      showInactive: "إظهار المخفية",
      noTimeSet: "لا يوجد موعد",
      noPrice: "لا يوجد سعر",
      prices: "الأسعار",
      mainPhoto: "الصورة الرئيسية",
      photos: "صور إضافية",
      destination: "الوجهة",
      cityLabel: "اسم المدينة (اختياري)",
    });
    // Hint lines under the master-form fields.
    en.help = en.help || {}; ar.help = ar.help || {};
    Object.assign(en.help, {
      cityExample: "Example: Sharm El Sheikh, Dahab, Hurghada, Marsa Alam",
      commaSeparated: "Separate values with commas",
      galleryUrls: "One image URL per line — shown to agents as a gallery.",
      commission: "Added to the hotel base price for client bookings",
      noRoomCap: "0 means no inventory cap",
      daysExample: "Example: Monday, Thursday",
      activityDestination: "Where this trip runs. The list is the Destinations page — use ＋ to add a new one.",
      cityFollowsDestination: "Leave blank to use the destination name",
      timeSlots: "Comma-separated, e.g. 09:00 AM, 02:00 PM, 06:00 PM",
      blankNotSold: "Leave blank if this trip is not sold per person",
      privateTourOne: "Private-tour price for one person",
    });
    Object.assign(ar.help, {
      cityExample: "مثال: شرم الشيخ، دهب، الغردقة، مرسى علم",
      commaSeparated: "افصل بين القيم بفاصلة",
      galleryUrls: "رابط صورة في كل سطر — تظهر للوكلاء كمعرض صور.",
      commission: "تُضاف إلى سعر الفندق الأساسي في حجوزات العملاء",
      noRoomCap: "صفر يعني بدون حد أقصى للغرف",
      daysExample: "مثال: الاثنين، الخميس",
      activityDestination: "المكان الذي تُنفَّذ فيه الرحلة. القائمة هي نفسها صفحة الوجهات — استخدم ＋ لإضافة وجهة جديدة.",
      cityFollowsDestination: "اتركه فارغًا ليأخذ اسم الوجهة تلقائيًا",
      timeSlots: "مفصولة بفاصلة، مثال: ٠٩:٠٠ ص، ٠٢:٠٠ م، ٠٦:٠٠ م",
      blankNotSold: "اتركه فارغًا إذا كانت الرحلة لا تُباع بسعر الفرد",
      privateTourOne: "سعر الرحلة الخاصة لشخص واحد",
    });
    en.securityAdmin = en.securityAdmin || {}; ar.securityAdmin = ar.securityAdmin || {};
    Object.assign(en.securityAdmin, {
      newTitle: "New security approval",
      editTitle: "Edit security approval",
      company: "Company",
      pickCompany: "Pick a company",
      deleteConfirm: "Delete this security approval and its invoice? This cannot be undone.",
      deleteBlockedPaid: "This approval is already paid — cancel it instead of deleting it.",
      repriced: "Saved. The fee was recalculated.",
      priceMissing: "No active approval fee is configured for this location and type.",
      repriceHint: "Changing the location, type, processing speed or passenger count recalculates the fee and the invoice.",
      noAirports: "No airports yet — add one on the Airports page first.",
    });
    Object.assign(ar.securityAdmin, {
      newTitle: "موافقة أمنية جديدة",
      editTitle: "تعديل الموافقة الأمنية",
      company: "الشركة",
      pickCompany: "اختر الشركة",
      deleteConfirm: "حذف هذه الموافقة الأمنية وفاتورتها؟ لا يمكن التراجع.",
      deleteBlockedPaid: "هذه الموافقة مدفوعة بالفعل — قم بإلغائها بدلًا من حذفها.",
      repriced: "تم الحفظ وإعادة حساب الرسوم.",
      priceMissing: "لا توجد رسوم مفعّلة لهذا المكان ونوع الموافقة.",
      repriceHint: "تغيير المكان أو النوع أو سرعة الإنجاز أو عدد الركاب يعيد حساب الرسوم والفاتورة.",
      noAirports: "لا توجد مطارات بعد — أضف مطارًا من صفحة المطارات أولًا.",
    });
  })();

  window.PortalI18n = { dict, t, setLang, initI18n, applyTranslations, formatNumber, formatMoney, formatDate };
})();
