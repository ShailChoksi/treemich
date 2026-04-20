export type ThumbnailWorkerRequestItem = {
  personId: string;
  url: string;
};

export type ThumbnailWorkerRequest = {
  id: number;
  items: ThumbnailWorkerRequestItem[];
};

export type ThumbnailWorkerResultFulfilled = {
  personId: string;
  status: "fulfilled";
  bitmap: ImageBitmap;
};

export type ThumbnailWorkerResultRejected = {
  personId: string;
  status: "rejected";
  error: string;
};

export type ThumbnailWorkerResult = ThumbnailWorkerResultFulfilled | ThumbnailWorkerResultRejected;

export type ThumbnailWorkerResponse = {
  id: number;
  results: ThumbnailWorkerResult[];
};
