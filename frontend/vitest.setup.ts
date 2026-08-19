import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Между тестами DOM должен быть чистым: иначе getByText находит узел из
// предыдущего теста и падение указывает не туда, где ошибка.
afterEach(cleanup);
