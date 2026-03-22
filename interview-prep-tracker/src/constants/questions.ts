import type { SystemDesignQuestion } from '../types';

/**
 * Curated system design practice questions grouped by company.
 * Each question has a stable id, title, YouTube resource URL, and difficulty level.
 */
export const SYSTEM_DESIGN_QUESTIONS: Record<string, SystemDesignQuestion[]> = {
  Google: [
    { id: 'g1', title: 'Design YouTube',          url: 'https://www.youtube.com/watch?v=jPKTo1iGQiE', difficulty: 'Hard'   },
    { id: 'g2', title: 'Design Google Drive',     url: 'https://www.youtube.com/watch?v=U0xTu6E2CT8', difficulty: 'Hard'   },
    { id: 'g3', title: 'Design Google Maps',      url: 'https://www.youtube.com/watch?v=jk3yvVfNvds', difficulty: 'Hard'   },
    { id: 'g4', title: 'Design Gmail',            url: 'https://www.youtube.com/watch?v=tndzLznxq40', difficulty: 'Medium' },
    { id: 'g5', title: 'Design Google Search',    url: 'https://www.youtube.com/watch?v=CeGtqouT8eA', difficulty: 'Hard'   },
    { id: 'g6', title: 'Design Google Docs',      url: 'https://www.youtube.com/watch?v=2auwirNBvGg', difficulty: 'Medium' },
    { id: 'g7', title: 'Design Google Calendar',  url: 'https://www.youtube.com/watch?v=2auwirNBvGg', difficulty: 'Medium' },
    { id: 'g8', title: 'Design Google Analytics', url: 'https://www.youtube.com/watch?v=EpASu_1dUdE', difficulty: 'Hard'   },
    { id: 'g9', title: 'Design Google Photos',    url: 'https://www.youtube.com/watch?v=VJpfO6KdyWE', difficulty: 'Medium' },
  ],
  Microsoft: [
    { id: 'm1', title: 'Design Microsoft Teams',    url: 'https://www.youtube.com/watch?v=5m0L0k8ZtEs', difficulty: 'Hard'   },
    { id: 'm2', title: 'Design OneDrive',           url: 'https://www.youtube.com/watch?v=U0xTu6E2CT8', difficulty: 'Hard'   },
    { id: 'm3', title: 'Design Outlook',            url: 'https://www.youtube.com/watch?v=tndzLznxq40', difficulty: 'Medium' },
    { id: 'm4', title: 'Design Azure Blob Storage', url: 'https://www.youtube.com/watch?v=UzLMhqg3_Wc', difficulty: 'Hard'   },
    { id: 'm5', title: 'Design Office 365',         url: 'https://www.youtube.com/watch?v=2auwirNBvGg', difficulty: 'Hard'   },
    { id: 'm6', title: 'Design Xbox Live',          url: 'https://www.youtube.com/watch?v=K-_ha_lyKWY', difficulty: 'Medium' },
    { id: 'm7', title: 'Design Skype',              url: 'https://www.youtube.com/watch?v=5m0L0k8ZtEs', difficulty: 'Medium' },
    { id: 'm8', title: 'Design LinkedIn (Microsoft)',url: 'https://www.youtube.com/watch?v=QZ9d9F0CpXE', difficulty: 'Hard'   },
    { id: 'm9', title: 'Design Power BI',           url: 'https://www.youtube.com/watch?v=EpASu_1dUdE', difficulty: 'Hard'   },
  ],
  Facebook: [
    { id: 'f1', title: 'Design Facebook News Feed',  url: 'https://www.youtube.com/watch?v=QmX2NPkJTKg', difficulty: 'Hard'   },
    { id: 'f2', title: 'Design Facebook Messenger',  url: 'https://www.youtube.com/watch?v=5m0L0k8ZtEs', difficulty: 'Hard'   },
    { id: 'f3', title: 'Design Instagram',           url: 'https://www.youtube.com/watch?v=VJpfO6KdyWE', difficulty: 'Hard'   },
    { id: 'f4', title: 'Design WhatsApp',            url: 'https://www.youtube.com/watch?v=vvhC64hQZMk', difficulty: 'Hard'   },
    { id: 'f5', title: 'Design Facebook Live',       url: 'https://www.youtube.com/watch?v=jPKTo1iGQiE', difficulty: 'Hard'   },
    { id: 'f6', title: 'Design Facebook Groups',     url: 'https://www.youtube.com/watch?v=QmX2NPkJTKg', difficulty: 'Medium' },
    { id: 'f7', title: 'Design Facebook Marketplace',url: 'https://www.youtube.com/watch?v=EpASu_1dUdE', difficulty: 'Medium' },
    { id: 'f8', title: 'Design Meta VR Platform',    url: 'https://www.youtube.com/watch?v=K-_ha_lyKWY', difficulty: 'Hard'   },
    { id: 'f9', title: 'Design Facebook Stories',    url: 'https://www.youtube.com/watch?v=VJpfO6KdyWE', difficulty: 'Medium' },
  ],
};
