declare const tailwind: {
  config: any;
};

declare const lucide: {
  createIcons: (options?: any) => void;
};

declare class Chart {
  constructor(ctx: any, config: any);
  destroy(): void;
  update(): void;
  data: any;
  options: any;
}

interface Window {
  lucide?: typeof lucide;
  Chart?: typeof Chart;
  tailwind?: typeof tailwind;
  editExpense?: (id: string) => void;
  deleteExpense?: (id: string) => void;
}

interface Navigator {
  standalone?: boolean;
}
