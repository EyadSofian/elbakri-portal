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
      calculatorsSub: "أدوات التسعير والعمولات والعملات",
      destinationsTitle: "الوجهات",
      destinationsSub: "إدارة الوجهات والمناطق السياحية الديناميكية",
      quoteRequestsTitle: "طلبات الأسعار",
      quoteRequestsSub: "طلبات التسعير المقدمة من الوكلاء",
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
      dueDate: "تاريخ الاستحقاق",
      invoice: "الفاتورة",
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
      calculatorsTitle: "Calculators", calculatorsSub: "Pricing, commission and currency tools",
      destinationsTitle: "Destinations", destinationsSub: "Manage dynamic travel destinations and areas",
      quoteRequestsTitle: "Quote Requests", quoteRequestsSub: "Price requests submitted by agents",
    },
    stat: {
      totalBookings: "Total Bookings", totalRevenue: "Total Revenue", pending: "Pending", activeCompanies: "Active Companies",
      activeUsers: "Active Users", walletExposure: "Wallet Exposure", hotels: "Hotels", services: "Services", invoicesDue: "Invoices Due",
      cancellations: "Cancellations", commission: "Commission", markup: "Markup", vsMonth: "vs last month", allTime: "All time",
      monthToDate: "Month to date", today: "Today", lastThirty: "Last 30 days",
    },
    th: {
      select: "Select", logo: "Logo", company: "Company", name: "Name", email: "Email", phone: "Phone", tier: "Tier", country: "Country",
      balance: "Balance", creditLimit: "Credit Limit", bookingsCount: "Bookings", usersCount: "Users", status: "Status",
      lastActivity: "Last Activity", actions: "Actions", ref: "Ref", type: "Type", details: "Details", service: "Service",
      route: "Route", city: "City", stars: "Stars", amount: "Amount", commission: "Commission", markup: "Markup", total: "Total",
      currency: "Currency", date: "Date", dueDate: "Due Date", invoice: "Invoice", before: "Before", after: "After",
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
      exportExcel: "Export to Excel", exportSelected: "Export Selected", bulkTopup: "Bulk Top-up", bulkDeactivate: "Bulk Deactivate",
      syncSheets: "Sync from Sheets", testConnection: "Test Connection", refresh: "Refresh", clear: "Clear", apply: "Apply",
      reset: "Reset", close: "Close", next: "Next", back: "Back", createBooking: "Create Booking", bookNow: "Book Now",
      markPaid: "Mark Paid", downloadPdf: "PDF", sendNotification: "Send notification", scheduleSync: "Schedule Sync",
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
  Object.assign(en.btn, { addPricing: "Add price period", importExcel: "Import Excel", syncing: "Syncing…", importing: "Importing…" });
  Object.assign(ar.btn, { addPricing: "إضافة فترة سعر", importExcel: "استيراد Excel", syncing: "جاري المزامنة…", importing: "جاري الاستيراد…" });
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
  };
  ar.securityApproval = {
    sharm: "شرم الشيخ", cairo: "القاهرة", borgElArab: "برج العرب",
    passportUpload: "جواز السفر (صورة أو PDF)", flightTicketUpload: "تذكرة الطيران (صورة أو PDF)",
    paxCount: "عدد المسافرين", hotelName: "اسم الفندق",
    types: "نوع الموافقة", selectType: "اختر نوع الموافقة",
    priceNote: "السعر محدد للشخص الواحد من الإدارة",
    uploadNote: "رفع جواز السفر وتذكرة الطيران للمتابعة",
  };

  // ── Airport Assist form ────────────────────────────────────────────────────
  en.airportAssist = {
    ticketUpload: "Flight Ticket (image or PDF)", arrivalDeparture: "Arrival / Departure Details",
    form: "Request Airport Assist", serviceType: "Service Type",
  };
  ar.airportAssist = {
    ticketUpload: "تذكرة الطيران (صورة أو PDF)", arrivalDeparture: "تفاصيل الوصول / المغادرة",
    form: "طلب مساعدة المطار", serviceType: "نوع الخدمة",
  };

  // ── SIM Card ───────────────────────────────────────────────────────────────
  en.simCard = {
    package: "SIM Package", selectPackage: "Select a package", dataSize: "Data",
    minutes: "Minutes / Calls", validity: "Validity", clientName: "Client Name",
    phone: "Client Phone", quantity: "Quantity", arrivalDate: "Arrival Date",
    requestTitle: "Request SIM Card", noPackages: "No SIM packages available",
    perSim: "per SIM",
  };
  ar.simCard = {
    package: "باقة الشريحة", selectPackage: "اختر باقة", dataSize: "البيانات",
    minutes: "دقائق / مكالمات", validity: "الصلاحية", clientName: "اسم العميل",
    phone: "هاتف العميل", quantity: "الكمية", arrivalDate: "تاريخ الوصول",
    requestTitle: "طلب شريحة اتصال", noPackages: "لا توجد باقات متاحة",
    perSim: "للشريحة",
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

  // ── Transport extra keys ───────────────────────────────────────────────────
  Object.assign(en.transport, {
    tripType: "Trip Type", oneWay: "One Way", flightDetails: "Flight / Arrival Details",
    route: "Route", passengers: "Passengers & Vehicle", priceSummary: "Price Summary",
    airport: "Airport", destination: "Destination",
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
    route: "المسار", passengers: "المسافرون والمركبة", priceSummary: "ملخص السعر",
    airport: "المطار", destination: "الوجهة",
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

  // ── Dashboard offers card ───────────────────────────────────────────────────
  en.offers.dashboardCard = "Active Offers";
  ar.offers.dashboardCard = "العروض النشطة";
  en.offers.viewAll = "View Offers";
  ar.offers.viewAll = "عرض العروض";

  en.validation.childAges = "Please enter all children ages";
  ar.validation.childAges = "يرجى إدخال أعمار جميع الأطفال";

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

  window.PortalI18n = { dict, t, setLang, initI18n, applyTranslations, formatNumber, formatMoney, formatDate };
})();
