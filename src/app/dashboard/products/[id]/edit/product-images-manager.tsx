"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Star, Trash2, Upload } from "lucide-react";
import { deleteProductImage, setPrimaryImage, uploadProductImages } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  btnPrimary,
  btnDestructiveOutlineSm,
  btnDestructiveSolid,
  btnSecondary,
  btnSecondarySm,
  cardClass,
  sectionTitleClass,
} from "@/lib/ui";

type ProductImage = {
  id: string;
  url: string;
  isPrimary: boolean;
};

const fieldsetClass = "rounded-lg border border-slate-200 p-4";
const legendClass = "px-1 text-sm font-medium text-slate-700";

export function ProductImagesManager({
  productId,
  images,
}: {
  productId: string;
  images: ProductImage[];
}) {
  const { t } = useLocale();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductImage | null>(null);

  async function handleUpload(formData: FormData) {
    setError(null);
    const files = formData.getAll("images").filter((v) => v instanceof File && v.size > 0);
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);
    const result = await uploadProductImages(productId, formData);
    setIsUploading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    fileInputRef.current?.form?.reset();
    router.refresh();
  }

  async function handleSetPrimary(imageId: string) {
    setError(null);
    setPendingId(imageId);
    const result = await setPrimaryImage(imageId);
    setPendingId(null);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setError(null);
    setPendingId(deleteTarget.id);
    const result = await deleteProductImage(deleteTarget.id);
    setPendingId(null);
    setDeleteTarget(null);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <section className={`${cardClass} p-6`}>
      <h2 className={`${sectionTitleClass} mb-4`}>{t("productEdit.imagesTitle")}</h2>

      {images.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">{t("productDetail.noImages")}</p>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((image) => (
            <div key={image.id} className="flex flex-col gap-2">
              <div className="relative">
                <Image
                  src={image.url}
                  alt=""
                  width={160}
                  height={160}
                  className="aspect-square w-full rounded-lg border border-slate-200 object-cover"
                />
                {image.isPrimary && (
                  <span className="absolute start-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    <Star className="h-3 w-3" fill="currentColor" />
                    {t("productEdit.primaryBadge")}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!image.isPrimary && (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(image.id)}
                    disabled={pendingId === image.id}
                    className={btnSecondarySm}
                  >
                    <Star className="h-3 w-3" />
                    {t("productEdit.setPrimary")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDeleteTarget(image)}
                  disabled={pendingId === image.id}
                  className={btnDestructiveOutlineSm}
                >
                  <Trash2 className="h-3 w-3" />
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form action={handleUpload}>
        <fieldset className={fieldsetClass}>
          <legend className={legendClass}>{t("productEdit.addImagesLabel")}</legend>
          <input
            ref={fileInputRef}
            name="images"
            type="file"
            accept="image/*"
            multiple
            className="w-full text-sm text-slate-700 file:me-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <button type="submit" disabled={isUploading} className={`${btnPrimary} mt-3`}>
            <Upload className="h-4 w-4" />
            {isUploading ? t("productEdit.uploading") : t("productEdit.uploadImages")}
          </button>
        </fieldset>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className={`w-full max-w-sm ${cardClass} p-6`}>
            <h3 className="mb-2 text-lg font-semibold text-slate-900">
              {t("productEdit.confirmDeleteImageTitle")}
            </h3>
            <p className="mb-5 text-sm text-slate-500">
              {t("productEdit.confirmDeleteImageBody")}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className={`${btnSecondary} flex-1`}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={pendingId === deleteTarget.id}
                className={`${btnDestructiveSolid} flex-1`}
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
